# AI Onboarding Prompt — WFSearch

Paste everything below the divider into any AI model / agent as your first
message before it touches this repo. It orients the model on the app, its
constraints, and the traps that have bitten before, and points it at the two
source-of-truth docs in the repo.

---

You are working on **WFSearch (WordFeud Gallery)** — a single-server Node.js 22+
web app that searches the WordFeud API for usernames and manages "galleries" of
found profiles in the browser. Before you write any code, **read these two files
in the repo, in this order:**

1. **`AGENTS.md`** — the short rules + the hard-won gotchas.
2. **`ARCHITECTURE.md`** — the full reference (HTTP API, account auth, the
   per-account rate-limit model, Tor fallback internals, testing, deployment,
   env vars, and a gotchas checklist).

Do not contradict them; if you change something they describe, **update both docs
in the same commit** so they stay the single source of truth.

## Hard constraints (do not break these)
- **Zero runtime dependencies.** Node 22 built-ins only (`http`, `net`, `crypto`,
  `fs`, `path`, `child_process`, global `fetch`). Never `npm install` a package.
- **No `package.json`.** `server.js`/`tor.js` are ESM via Node's "detect-module".
  Do NOT add a `package.json` with `"type":"commonjs"` (it breaks every `import`).
  If one must exist, use `"type":"module"`.
- **The entire frontend is one template literal** (`const HTML = \`...\``) at the
  top of `server.js`. Any UI change edits that string. **Backslashes must be
  DOUBLED** in the source for browser-facing regex (`\\s`, `\\d`, `\\-`, `\\n`)
  because template literals silently drop a lone `\`. **Always verify the SERVED
  HTML** — `curl http://localhost:8011/ | grep 's+/g'` — never trust the source.
- The app listens on **8011** (in-container). It's deployed as a Docker Compose
  service on the host (see `ARCHITECTURE.md` §8); it is NOT run in the ephemeral
  agent container.

## The one model most agents get wrong: rate limiting
WordFeud rate-limits **per ACCOUNT, not per IP** (verified live across 8 Tor
exits). Therefore:
- A `limit_exceed` is only bypassed by **switching accounts**, never by rotating
  Tor exits and never by re-logging in (a re-login does NOT reset an account).
- `ipLimitedUntil` is a *shared* flag that only decides **whether** to take the
  Tor path. `markRateLimited()` sets it and mirrors it to every account but **must
  not clear session cookies** (the session stays valid; clearing them forces a
  costly Tor re-login).
- `torSearch(acc, username)` returns **`[]` = "no users found" (STOP)** vs
  **`null` = limited/blocked/failure (try the NEXT account)**. The `/search` loop
  depends on that distinction — don't change it without updating the loop.
- `torWorkingLabel` remembers the last account that got through via Tor and it is
  tried **first**, so a steady-state limited search is ONE fast Tor request.

## Tor control protocol (if you touch `tor.js`)
- `controlCmd()` must return the **full multi-line** reply: the `GETINFO` value
  lives on the `250-...` header line and the reply ends with a bare `250 done`.
  Discarding the header makes bootstrap detection (`PROGRESS=100`) never fire even
  though Tor is up.
- Tor is spawned as a child process bound to `127.0.0.1` (SOCKS `:9050`, control
  `:9051`, cookie auth). Requests go through a `curl --socks5-hostname` subprocess
  (Node `fetch` can't speak SOCKS) — the `Dockerfile` installs `tor` + `curl`.
- Circuit rotation is **event-driven**: only an exit-level failure (WAF/network)
  "poisons" the circuit and triggers a retry with `SIGNAL NEWNYM` + a bounded poll
  of `CIRC LIST BUILT`. Never a fixed sleep. A `limit_exceed` does NOT rotate.

## Testing & verification
- **No real Tor needed**: `node tests/e2e_tor_speedup.js` runs the whole Tor path
  against `tests/fake_env.js` (mock WordFeud + minimal SOCKS5 + fake Tor control +
  fake `tor` binary). It must pass before you consider a `tor.js`/`server.js`
  change done. Keep the fake control's `GETINFO` replies in the real **multi-line**
  format, or the test passes while real Tor fails.
- After a frontend change, `curl` the running app and check the served HTML (regex
  backslashes, new elements present).
- Syntax-check both files: `node --check server.js && node --check tor.js`.

## Definition of done for a feature change
1. Code works and `node --check` passes on every file you touched.
2. `node tests/e2e_tor_speedup.js` still passes (if you touched the search/Tor path).
3. Served HTML verified if you touched the frontend.
4. **`AGENTS.md` and/or `ARCHITECTURE.md` updated** to match (features, env vars,
   gotchas, `localStorage` keys, API endpoints) — and the README feature list if
   it's a user-facing feature.
5. Commit with a clear message; include `Co-authored-by: openhands <openhands@all-hands.dev>`
   when committing as the OpenHands agent.

If you hit a conflict between this prompt and the docs, **the docs win** and you
should tell the user, because the docs are the maintained source of truth.
