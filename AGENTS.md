# WFSearch — WordFeud Gallery

Single-file Node.js app (`server.js`, Node 22+, no dependencies) that searches the
WordFeud API and manages profile galleries. Listens on port **8011** inside the app.

> **Deep reference:** for the full architecture (HTTP API, auth, rate-limit model,
> Tor internals, testing, deployment, env vars, gotchas) read
> [`ARCHITECTURE.md`](./ARCHITECTURE.md). This file is the short rules + the
> hard-won gotchas. Keep the two in sync.

## Self-hosting (persistent — survives reboots)

The app is deployed on the host as a Docker Compose service, mirroring the `WFHelper`
setup. It does **not** rely on the ephemeral OpenHands agent-server container (which had
`RestartPolicy=no` + no persistent mounts + a random host port, so it died on every reboot).

Files live in `~/WFSearch/` on the host (cloned from `main`):
- `Dockerfile` — `node:22-alpine`, runs `server.js`
- `compose.selfhost.yaml` — `restart: unless-stopped`; publishes `0.0.0.0:43895:8011`
  (stable LAN address) and `127.0.0.1:8011:8011` (for Caddy); healthchecks `GET /`

Reachable URLs:
- `http://192.168.1.85:43895/`  (LAN, direct)
- `https://wfsearch.local/`     (host Caddy → `127.0.0.1:8011`, `tls internal`;
  `wfsearch.local` maps to `127.0.0.1` in `/etc/hosts`)

## Updating the app after a code change

```bash
cd ~/WFSearch
git pull
docker compose -f compose.selfhost.yaml up -d --build
```

`restart: unless-stopped` + Docker/Caddy being `systemctl enable`d means the container
comes back automatically after a reboot (and Docker restarts it if it crashes).

## Gotcha: backslashes in the inlined HTML

The entire browser app (CSS + JS) is inlined in `server.js` inside one template
literal. Inside a template literal, a backslash in front of an unrecognized
character is **silently dropped**. So a single backslash in `normName`'s regex
`/\s+/g` would be served to the browser as `/s+/g`, which eats the letter "s"
out of every name. The source file therefore carries a **doubled** backslash for
every regex metacharacter that must reach the browser (`\\s`, `\\d`, `\\-`, `\\n`),
and the served HTML then contains a single backslash as intended.

Symptom of a regression: the filter bar finds nothing for names containing "s"
(typing "samantha" shows "amatha"). Always verify the *served* HTML — `curl` the
running app and grep the regex — never trust the source file alone.

## Rate limit is per-ACCOUNT (and Tor alone can't bypass it)

WordFeud rate-limits primarily by **account**, not by IP. This was verified live:
a rate-limited account kept returning `limit_exceed` through **8 different Tor
exit IPs** (egress IP confirmed distinct via `ipify`), while a *different* account
succeeded on its first Tor exit. So rotating Tor exit IPs does **not** clear the
limit for a limited account — you must switch accounts. (The old docs said the
limit was per-IP and that "switching accounts can't bypass it"; that was wrong.)

Consequences for the design:
- `ipLimitedUntil` (in `server.js`) is a shared flag used to decide *whether* to
  take the Tor path. When any search gets `limit_exceed`, `markRateLimited` sets it
  and mirrors it onto every account so the per-account badges stay consistent.
- `probeIpLimit()` re-checks with **one** probe call, on a 30s timer, only while
  limited. `GET /api/accounts` returns `ipLimitedUntil`, `tor: { enabled, ready,
  starting }` and `torWorking` (label of the last account that got through via Tor).
- The frontend disables the search button with a live countdown while limited, and
  keeps it available while limited **if Tor is enabled** (labelled "via Tor").

### Tor fallback (`tor.js`) + account rotation
When the limit flag is set, `/search` routes through a **local Tor circuit** and
rotates across accounts until one gets through. Speed matters (the old behavior
was ~15-20s per limited search), so the design is:
- **Account rotation is the point, not circuit rotation.** A `limit_exceed` is
  per-account, so a fresh circuit cannot help that account: `torSearch` returns
  `null` immediately (no NEWNYM) and the `/search` loop tries the next account on
  the **same** healthy exit. `torWorkingLabel` (server.js) remembers the last
  account that got through and tries it first, so a steady-state limited search
  is a single Tor request (tens of ms).
- **Circuit rotation is event-driven.** Only exit-level failures (WAF block,
  curl/network failure) "poison" the circuit; the retry runs `SIGNAL NEWNYM`
  first and waits for a built circuit by polling `CIRC LIST BUILT` (bounded) -
  never a fixed sleep.
- **Session cookies are kept across rate limits** (the old code wiped them in
  `markRateLimited`, forcing a costly re-login via Tor on every limited search).
  Re-login happens only on `login_required` or first use.
- **Tor is pre-warmed**: `ensureTor()` runs at startup and on first limit
  detection, so the one-time bootstrap (2-40s) never lands on a user's search.
- `tor.js` spawns Tor as a child process bound to
  `127.0.0.1` inside the container: SOCKS `:9050`, control `:9051` (cookie auth).
  State lives under `/data/tor` (the `./data:/data` mount), so it survives rebuilds.
  `ensureTor` probes the control port before spawning: if a previous bootstrap
  wait timed out but Tor finished anyway, it reuses the running process (a second
  Tor with the same DataDirectory refuses to start).
- Because Node's `fetch` can't speak SOCKS, Tor requests go through a `curl
  --socks5-hostname` subprocess (`torFetch`). `Dockerfile` therefore adds `tor curl`.
- `torSearch` returns `null` on failure and `[]` on "no users found" — the `/search`
  loop relies on that distinction to decide whether to try the next account.
- Disable with env `TOR_ENABLED=0` (falls back to the old "wait N min" behavior).

**Tor bootstrap gotchas (all hit and fixed on Tor 0.4.9.14):** the generated `torrc`
must use `RunAsDaemon 0` (Tor rejects `no` and exits before bootstrap); the control
cookie file is `control_auth_cookie` (not `control.authcookie`); and the control
protocol reports bootstrap as `PROGRESS=100` (not `PROGRESS 100`). Check the *live*
container logs (`docker logs ... | grep tor`) — Tor bootstrap failures log there, not
to the app's stdout.

**Control-protocol gotcha:** `GETINFO` replies are multi-line — the *value* arrives
on the `250-...` header line and the reply ends with a bare `250 done` line.
`controlCmd()` therefore includes `250-` header content in the returned text;
discarding it makes `PROGRESS=100` invisible and the bootstrap wait always times
out even though Tor is fully up (symptom: `tor: { ready: false, starting: false }`
while `curl --socks5-hostname 127.0.0.1:9050` works fine).

**Testing without real Tor:** `tests/e2e_tor_speedup.js` exercises the whole path
with no real Tor: `tests/fake_env.js` stands up a mock WordFeud API (direct =
`limit_exceed`, via-Tor = ok), a minimal SOCKS5 proxy (tunnels every CONNECT to
the "Tor" mock), a fake Tor control port, and a fake `tor` binary on PATH. Run
with `node tests/e2e_tor_speedup.js` (all checks must pass). Gotchas hit while
building it:
- The SOCKS CONNECT reply must be 10 bytes with ATYP=`1` (IPv4) or curl hangs.
- The SOCKS proxy must **buffer client bytes that arrive before the upstream
  tunnel is connected** (curl sends the HTTP request right after the SOCKS
  reply) and must **consume the CONNECT request itself** — only forward bytes
  that arrived *after* it, or the mock gets a 400.
- The fake control port must answer `GETINFO` in the real **multi-line** format
  (`250-...PROGRESS=100...` then `250 done`); a single-line reply made the e2e
  pass while real Tor failed — see the control-protocol gotcha above.
- Do NOT tag requests with an injected header to route them; Node's HTTP parser
  rejects it (400).

### Note on `package.json` / module type
The app has **no `package.json`**. `server.js` and `tor.js` use ESM `import`, which
works because Node 22 auto-detects module syntax ("detect-module") and runs `.js`
files as ESM when there's no `package.json` to pin the type. Do NOT add a
`package.json` with `"type":"commonjs"` — that would break every `import`. If you
must add one, set `"type":"module"`.
