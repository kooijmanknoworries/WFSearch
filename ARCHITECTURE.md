# WFSearch — Architecture Reference

Detailed reference for anyone (human or AI) adding features to WFSearch. Read
`AGENTS.md` first for the short agent-facing rules; this file is the deep dive.

WordFeud Gallery is a single-server web tool that searches the WordFeud API for
usernames (generating many name/number variations) and lets the user manage
"galleries" of found profiles in the browser.

---

## 1. Tech stack & hard constraints

- **Node.js 22+, zero runtime dependencies.** Only Node built-ins
  (`http`, `net`, `crypto`, `fs`, `path`, `child_process`, `fetch`). Do not add
  `npm install` dependencies — it breaks the "no `node_modules`" deploy model.
- **No `package.json`.** `server.js` and `tor.js` use ESM `import`; Node 22
  "detect-module" runs `.js` as ESM because nothing pins the type. **Do NOT add a
  `package.json` with `"type":"commonjs"`** — it breaks every `import`. If one
  must be added, use `"type":"module"`.
- **Single-file server + inlined frontend.** The entire browser app (HTML + CSS +
  JS) is one template literal `const HTML = \`...\`` near the top of `server.js`.
  Any UI change edits that string. **Backslash gotcha:** in a template literal a
  `\` before an unrecognized char is silently dropped, so browser-facing regexes
  use **doubled** backslashes in the source (`\\s`, `\\d`, `\\-`, `\\n`). Verify
  the *served* HTML (`curl http://localhost:8011/ | grep 's+/g'`), not the source.
- **Files:**
  | file | role |
  |---|---|
  | `server.js` (~1400 ln) | HTTP server, all routes, account/rate-limit logic, inlined frontend |
  | `tor.js` (~310 ln) | Tor subprocess mgmt + control protocol + Tor-routed fetch/login/search |
  | `tests/e2e_tor_speedup.js` | End-to-end Tor-path test (no real Tor) |
  | `tests/fake_env.js` | Mock WordFeud API + minimal SOCKS5 + fake Tor control + fake `tor` bin |
  | `Dockerfile` | `node:22-alpine` + `apk add tor curl`, runs as non-root `node` |
  | `compose.selfhost.yaml` | Self-hosted compose service |
  | `AI-ONBOARDING.md` | Paste-ready prompt to onboard any AI model onto this repo |

---

## 2. HTTP API surface

All routing is a hand-rolled `http.createServer` switch (no framework). CORS is
open (`Access-Control-Allow-Origin: *`).

| Method & path | Purpose |
|---|---|
| `GET /` | Serves the inlined single-page app (`HTML`) |
| `GET /avatar/:userId` | Proxies `https://avatars-wordfeud-com.s3.amazonaws.com/256/<id>` (avoids browser CORS). `image/jpeg` or 404 |
| `GET /api/accounts` | Account pool state (see §4) |
| `POST /api/accounts/switch` | `{label}` — set the preferred account (logs in only if no session) |
| `POST /api/accounts/add` | `{label?,email,password}` — add + verify (login) a new account |
| `POST /api/accounts/delete` | `{label}` — remove (refuses the last one; re-assigns `preferred`) |
| `POST /search` | `{username}` — the main search (see §5) |

`/search` response shape:
```json
{ "ok": true|false,
  "results": [ { "id": 123, "username": "name", "created": "2020-01-01T00:00:00Z" } ],
  "viaTor": true,                 // only when routed through Tor
  "message": "No users found",     // only when ok:false / empty
  "rateLimited": true }            // only when all attempts failed while limited
```
`created` (account age) is filled for the **first** result only, via one extra
profile call (direct or Tor).

---

## 3. WordFeud account auth

- Login: `POST {WF_BASE}/wf/user/login/email/` with
  `{ email, password: sha1(password + "JarJarBinks9") }` (hex). The session cookie
  (`sessionid=...`) from `Set-Cookie` is stored on the account object in memory.
- Search: `POST {WF_BASE}/wf/user/search/` `{ username_or_email }` with the
  `Cookie: sessionid=...` header.
- Profile: `GET {WF_BASE}/wf/user/<id>/profile/` → `content.created`.
- The WAF sometimes answers with an **HTML block page** instead of JSON when it
  sees too many requests. Always `JSON.parse` in a try/catch and treat
  non-object bodies as "WAF blocked", not as a crash.
- **Re-login does NOT reset an account's rate limit** (the limit is per-account,
  not per-session). Don't add "re-login to unblock" logic — it only wastes quota
  and can trip the WAF.

---

## 4. Account pool & rate-limit model

### 4.1 Pool
- Accounts are **seeds** in code (`SEED_ACCOUNTS`) but are **persisted to disk**
  at `DATA_DIR/accounts.json` (the `./data:/data` mount), so additions made in
  the UI survive rebuilds. `loadAccountsFromDisk()` wins over the seeds if the
  file exists.
- Each account: `{ label, email, password, preferred, cookie?, rateLimitedUntil? }`.
  `cookie` is in-memory only (never persisted). Exactly one account is
  `preferred` (searched first); `orderedAccounts()` puts it first.
- At startup **all accounts are logged in in the background**
  (`Promise.allSettled`) so switching is instant.

### 4.2 Rate limit is per-ACCOUNT, not per-IP (verified live)
A rate-limited account keeps returning `limit_exceed` across **8 different Tor
exit IPs**, while a different account succeeds on its first exit. Consequence:
**rotating Tor exits cannot un-limit an account — you must switch accounts.**

- `ipLimitedUntil` (in `server.js`) is a **shared flag** used only to decide
  *whether to take the Tor path*. On any `limit_exceed`, `markRateLimited()`
  sets it and mirrors it onto every account so the UI badges stay consistent.
  It **does not clear cookies** (the session stays valid).
- `RATE_LIMIT_MS = 5 min`, `PROBE_INTERVAL_MS = 30 s`.
- `probeIpLimit()` runs on a 30 s timer **only while limited** (zero cost when
  free). One probe search (a sentinel username) tells the state of the whole IP:
  `limit_exceed` → `markRateLimited`; any other valid JSON → `clearRateLimits`;
  non-JSON / network error → `"unknown"` (keep current state, don't guess).
  `probeInFlight` prevents overlapping probes.

---

## 5. Search flow (`POST /search`)

```
isIpLimited()?
 ├─ NO (fast path): direct search with the preferred account.
 │    ├─ limit_exceed  → markRateLimited + ensureTor() in background (first limit)
 │    ├─ API error     → acc.cookie=null, return error
 │    └─ success       → clearRateLimits(); results = [...]
 └─ YES (slow path, only if TOR_ENABLED):
      for each account in torOrderedAccounts():   // torWorking first
         r = await torSearch(acc, username)
         r === null  → limited/blocked  → try NEXT account (same circuit)
         r === []    → "no users found" → stop, return empty
         r === [...] → success → viaTor=true, torAcc=acc, torWorkingLabel=acc.label; stop
```
If `results` is still `null` (Tor disabled or every account failed): respond
`{ ok:false, rateLimited:true, message: ... }` (with a "wait N min" countdown
when Tor is off).

### 5.1 Name variations (client-side, in the inlined JS)
`generateVariations(name)` expands a base name into a `Set` of candidates the
frontend searches in a batch:
- base name, and `name_`
- `name + sep + year` for years **1971–1985**
- `name + sep + d` for digits **0–9**
- `name + sep + n` for sequentials **1, 12, 123, 1234, 12345**
- `sep` ∈ `["", " ", "_", "#", "-"]`
So `wendy` → `wendy1981`, `wendy_1981`, `wendy#1981`, `wendy-1981`, `wendy1`,
`wendy123`, … (~125 variants).

---

## 6. Tor fallback (`tor.js`) — the slow-path engine

Tor is spawned **as a child process inside the container**, bound to
`127.0.0.1`. Node `fetch` can't speak SOCKS, so Tor requests go through a
`curl --socks5-hostname 127.0.0.1:9050` subprocess (`torFetch`). The `Dockerfile`
therefore installs `tor` and `curl`. State lives under `/data/tor` (survives
rebuilds).

### 6.1 Exports
| export | returns |
|---|---|
| `TOR_ENABLED` | `false` only if env `TOR_ENABLED=0` |
| `TOR_SOCKS_PORT` / `TOR_CONTROL_PORT` | `9050` / `9051` (env-overridable) |
| `torStatus()` | `{ enabled, ready, starting }` |
| `ensureTor()` | starts Tor (if not running) and resolves when bootstrap=100 |
| `torSearch(acc, username)` | `results[]` on success, `[]` = "no users", `null` = limited/blocked/fail |
| `torProfile(acc, userId)` | `created` string or `null` |

### 6.2 Startup pre-warm
`server.js` calls `ensureTor().catch(()=>{})` **at startup** and again on the
**first** `limit_exceed`. This hides the one-time bootstrap (2–40 s) from any
user's search. `ensureTor()` is idempotent and safe to call concurrently:
- if already `ready` → resolve
- if a start is `in-flight` → return that promise
- otherwise: **probe the control port first** (`GETINFO version`). If Tor is
  already answering (e.g. a previous wait timed out but bootstrap finished),
  **reuse it** — a second Tor with the same `DataDirectory` refuses to start.
  Only if the probe fails does it write `torrc` and spawn the process.
- Wait for bootstrap by polling `GETINFO status/bootstrap-phase` for
  `PROGRESS=100` (bounded, ~40 s).

### 6.3 Circuit management — event-driven, never fixed sleeps
- A "circuit" = one Tor exit. `torSearch` runs up to **2 attempts** on the same
  account. Attempt 2 only happens if attempt 1 was an **exit-level failure**
  (WAF block / curl-network failure), which "poisons" the circuit:
  `poisonCircuit()` → attempt 2 runs `SIGNAL NEWNYM` first, then **polls
  `CIRC LIST BUILT`** for a built circuit (bounded ~15 s) instead of a fixed 6 s
  sleep. On a healthy circuit the retry clears the poison.
- **A `limit_exceed` does NOT poison the circuit.** Because the limit is
  per-account, a fresh exit can't help that account. `torSearch` returns `null`
  immediately (no NEWNYM) so the caller can move to the next account on the
  *same* healthy exit. This is the key speed win.

### 6.4 Account rotation & `torWorking`
- `torSearch` reuses the account's **in-memory session cookie** if present; it
  only logs in via Tor (`torLogin`) when there's no cookie or the API returns
  `login_required`. Logging in directly (non-Tor) while limited would leave from
  the limited IP, so the login itself must go through Tor.
- The caller (`server.js`) remembers `torWorkingLabel` = the last account that
  got through via Tor. `torOrderedAccounts()` tries it **first** — it is by
  definition not limited (for now) — so a steady-state limited search is a
  **single Tor request (tens of ms)**, not a rotation.
- Exposed via `GET /api/accounts` as `torWorking`.

### 6.5 Control protocol (Tor control port) — critical gotcha
`controlCmd(cmd)` opens a fresh socket, authenticates with the cookie
(`AUTHENTICATE <hex>`), sends one command, and returns the **full** reply text.
- Tor replies are **multi-line**: a `250-<data>` header (which carries the value
  for `GETINFO`), data lines, and a terminal `250 ...` line. `controlCmd`
  **must include** the `250-` header content in the returned text — discarding it
  makes `PROGRESS=100` invisible so the bootstrap wait always times out even
  though Tor is up (symptom: `tor:{ready:false,starting:false}` while
  `curl --socks5 127.0.0.1:9050` works).
- The control **cookie** file is `control_auth_cookie` (Tor 0.4.9+), not
  `control.authcookie` — `readCookie()` tries both.
- Generated `torrc` must use `RunAsDaemon 0` (Tor rejects `no`).
- Bootstrap reports as `PROGRESS=100` (not `PROGRESS 100`).
- **Debug** with `TOR_DEBUG=1` to log curl/parse failures to the app stdout.
- Check the **live** container logs (`docker logs ... | grep tor`) — Tor
  bootstrap failures log to `tor.log`/stdout, not the app's normal output.

---

## 7. Frontend (inlined in `server.js`)

Dark, single-page, Dutch-language UI. State is **entirely in the browser's
`localStorage`** — the server is stateless for galleries.

`localStorage` keys:
| key | content |
|---|---|
| `wf_galleries` | `{ [galleryKey]: {name, ...} }` map of gallery metadata |
| `wf_current_gallery` | currently selected gallery key |
| `wf_<galleryKey>` | that gallery's profile/history array |
| `wf_invited` | array of userIds marked "uitgenodigd" (survives sessions) |
| `wf_searched` | array of userIds already searched (dedupe) |
| `wf_hide_avatars` | `"1"`/`"0"` — one-click "Verberg foto's" toggle to hide all gallery photos |

Features: name search with auto-variation batching, Dutch-names dropdown (A–Z),
popular-names dropdown (top-500 CBS), galleries (create/save/load/delete),
invite marking, **account-age filter** (max years/days to hide old accounts),
a **hide-photos toggle** (replaces avatars with an initials placeholder),
result-stats banner (persists until next search), red API-error banner, and a
live rate-limit countdown on the search button (stays available while limited if
Tor is on, labelled "via Tor"). The frontend polls `/api/accounts` every 30 s and
ticks the countdowns every 1 s.

> **When you add a frontend feature**, update both this list *and* the README
> feature bullet list so the docs stay in sync with the inlined UI.

---

## 8. Deployment

**Self-hosted Docker Compose** (survives reboots). The app does **not** run in
the ephemeral agent-server container (that had `RestartPolicy=no`, no mounts, a
random port, and died every reboot).

- Host repo lives at `~/WFSearch/` (cloned from `main`).
- `Dockerfile`: `node:22-alpine` + `tor` + `curl`, runs as non-root `node`,
  copies `server.js` + `tor.js`.
- `compose.selfhost.yaml`: `restart: unless-stopped`; ports
  `0.0.0.0:43895:8011` (stable LAN) and `127.0.0.1:8011:8011` (for Caddy);
  volume `./data:/data`; healthcheck `GET /`.
- Docker + Caddy are `systemctl enable`d, so everything comes back after a reboot.

Reachable URLs (host `192.168.1.85`):
- `http://192.168.1.85:43895/` (LAN, direct)
- `https://wfsearch.local/` (host Caddy → `127.0.0.1:8011`, `tls internal`;
  `wfsearch.local` maps to `127.0.0.1` in `/etc/hosts`)

### Updating after a code change
```bash
cd ~/WFSearch
git pull
docker compose -f compose.selfhost.yaml up -d --build
```
If the image didn't change the container may just say "Running"; use
`docker compose -f compose.selfhost.yaml up -d --force-recreate` to be certain.

### Environment variables
| var | default | meaning |
|---|---|---|
| `PORT` | `8011` | listen port (in-container) |
| `WF_BASE_URL` | `https://api.wordfeud.com` | WordFeud API base |
| `DATA_DIR` | `/data` | accounts.json + tor state dir |
| `WF_EMAIL` / `WF_PASSWORD` | (seed) | preferred account override |
| `TOR_ENABLED` | enabled | set `0` to disable Tor fallback |
| `TOR_SOCKS_PORT` / `TOR_CONTROL_PORT` | `9050` / `9051` | Tor ports |
| `TOR_DATA_DIR` | `/data/tor` | Tor data dir |
| `TOR_DEBUG` | off | set `1` for verbose Tor logging |
| `NODE_ENV` | `production` | (set by compose) |

> **Security note:** a fallback password is hardcoded as `DEFAULT_PASSWORD` in
> `server.js` and real account credentials live in `data/accounts.json`. Keep
> this repo **private** and the `data/` mount non-world-readable.

---

## 9. Testing (no real Tor required)

`tests/e2e_tor_speedup.js` runs the whole Tor path against fakes:
`tests/fake_env.js` brings up a mock WordFeud API (direct = `limit_exceed`,
via-Tor = ok), a **real minimal SOCKS5 proxy** (tunnels every CONNECT to the
"Tor" mock), a **fake Tor control port**, and a fake `tor` binary on `PATH`.

Run: `node tests/e2e_tor_speedup.js` (all checks must pass). Scenarios:
- S1 first limited search (limited account skipped, working account found, fast)
- S2 steady-state search (torWorking first, one request, no NEWNYM, no re-login)
- S3 WAF block → poison + rotate + retry same account
- S4 "no users found" returns `ok:false` with `viaTor` (not an error)

Building-mock gotchas (already solved in `fake_env.js`):
- SOCKS CONNECT reply must be **10 bytes, ATYP=`1`** (IPv4) or `curl` hangs.
- The proxy must **buffer client bytes that arrive before the tunnel is up**
  (curl sends the HTTP request right after the SOCKS reply) and must **consume
  the CONNECT request itself** (only forward bytes *after* it), or the mock 400s.
- The fake control port must answer `GETINFO` in the real **multi-line** format
  (`250-...PROGRESS=100...` then `250 done`); a single-line reply makes the e2e
  pass while real Tor fails.
- **Do NOT** route requests by injecting a custom header — Node's HTTP parser
  rejects it (400).

---

## 10. Local development (no Docker)

```bash
node server.js                 # runs on http://localhost:8011
TOR_ENABLED=0 node server.js   # skip Tor (fastest for UI work)
node tests/e2e_tor_speedup.js  # run the Tor-path e2e (no real Tor)
```
For UI work you don't need Tor or a real WordFeud session — the app boots and
serves the page regardless; only live searches hit the real API.

---

## 11. Gotchas checklist (things that bite)

1. **Backslashes in inlined HTML** — double them in source; verify served HTML.
2. **Tor control multi-line replies** — keep `250-` header content in
   `controlCmd`'s return, or bootstrap detection never fires.
3. **Rate limit is per-ACCOUNT** — never try to "un-limit" by rotating Tor
   exits or re-logging in; switch accounts instead.
4. **`torSearch` return contract** — `[]` (not found, stop) vs `null`
   (limited/blocked, try next). The `/search` loop depends on this.
5. **WAF block pages** — non-JSON responses; always `JSON.parse` in try/catch.
6. **No `package.json`** (and if added, `"type":"module"`), **no npm deps**.
7. **Tor `RunAsDaemon 0`**, cookie file `control_auth_cookie`,
   `PROGRESS=100`.
8. **`/data` must be writable by the `node` user** (accounts.json + tor state).
