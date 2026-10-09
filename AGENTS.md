# WFSearch — WordFeud Gallery

Single-file Node.js app (`server.js`, Node 22+, no dependencies) that searches the
WordFeud API and manages profile galleries. Listens on port **8011** inside the app.

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
  limited. `GET /api/accounts` returns `ipLimitedUntil` and `tor: { enabled, ready, starting }`.
- The frontend disables the search button with a live countdown while limited, and
  keeps it available while limited **if Tor is enabled** (labelled "via Tor").

### Tor fallback (`tor.js`) + account rotation
When the IP flag is set, `/search` routes through a **local Tor circuit** *and*
rotates across accounts (preferred first), each via a fresh Tor circuit, until one
gets through. This is what actually bypasses the per-account limit.
- `tor.js` spawns Tor as a child process (lazy, on first limited request) bound to
  `127.0.0.1` inside the container: SOCKS `:9050`, control `:9051` (cookie auth).
  State lives under `/data/tor` (the `./data:/data` mount), so it survives rebuilds.
- Because Node's `fetch` can't speak SOCKS, Tor requests go through a `curl
  --socks5-hostname` subprocess (`torFetch`). `Dockerfile` therefore adds `tor curl`.
- `torSearch` tries up to 2 circuits; the second runs `SIGNAL NEWNYM` first to rotate
  to a fresh exit. It logs in via Tor if there's no valid session (a direct login
  would leave from the limited IP).
- `torSearch` returns `null` on failure and `[]` on "no users found" — the `/search`
  loop relies on that distinction to decide whether to try the next account.
- Disable with env `TOR_ENABLED=0` (falls back to the old "wait N min" behavior).

**Tor bootstrap gotchas (all hit and fixed on Tor 0.4.9.14):** the generated `torrc`
must use `RunAsDaemon 0` (Tor rejects `no` and exits before bootstrap); the control
cookie file is `control_auth_cookie` (not `control.authcookie`); and the control
protocol reports bootstrap as `PROGRESS=100` (not `PROGRESS 100`). Check the *live*
container logs (`docker logs ... | grep tor`) — Tor bootstrap failures log there, not
to the app's stdout.

**Testing without real Tor:** the Tor fallback is exercised end-to-end with a mock
WordFeud API + a real (minimal) SOCKS5 proxy + a fake Tor control port + a fake
`tor` binary. The SOCKS CONNECT reply must be 10 bytes with ATYP=`1` (IPv4) or
curl hangs. See the two-mock design (direct mock = limited, tor mock = ok, SOCKS
tunnels to the tor mock) — do NOT try to tag requests with an injected header;
Node's HTTP parser rejects it (400).

### Note on `package.json` / module type
The app has **no `package.json`**. `server.js` and `tor.js` use ESM `import`, which
works because Node 22 auto-detects module syntax ("detect-module") and runs `.js`
files as ESM when there's no `package.json` to pin the type. Do NOT add a
`package.json` with `"type":"commonjs"` — that would break every `import`. If you
must add one, set `"type":"module"`.
