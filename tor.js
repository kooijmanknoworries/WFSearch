// Tor fallback for the WordFeud rate limit (see /search in server.js).
// WordFeud rate-limits per ACCOUNT (verified live: a limited account stays
// limited through many fresh Tor exits, while another account succeeds on its
// first exit). When the limit flag is set, requests are routed through a local
// Tor circuit; rotating the circuit mainly helps against exit-level blocks
// (WAF, an exit IP that is itself limited).
// Tor is a child process, started lazily (pre-warmed at startup), bound to 127.0.0.1
// inside the container (SOCKS :9050, control :9051 with cookie auth). State
// lives under TOR_DATA_DIR (mounted /data in the container) so it survives
// rebuilds. Needs the `tor` and `curl` binaries (see Dockerfile).
// Disable with TOR_ENABLED=0.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";

export const TOR_ENABLED = process.env.TOR_ENABLED !== "0";
export const TOR_SOCKS_PORT = Number(process.env.TOR_SOCKS_PORT || 9050);
export const TOR_CONTROL_PORT = Number(process.env.TOR_CONTROL_PORT || 9051);
const TOR_DATA_DIR = process.env.TOR_DATA_DIR || "/data/tor";
const TOR_RC_FILE = path.join(TOR_DATA_DIR, "torrc");
// Tor writes the control cookie as "control_auth_cookie" (0.4.5+) but older
// releases used "control.authcookie". readCookie() tries both.
const TOR_COOKIE_FILE = path.join(TOR_DATA_DIR, "control_auth_cookie");
const TOR_BIN = fs.existsSync("/usr/sbin/tor") ? "/usr/sbin/tor" : "tor";
const WF_BASE = process.env.WF_BASE_URL || "https://api.wordfeud.com";

let torReady = false;
let torStarting = null;
const BOOTSTRAP_TIMEOUT_MS = 40000;

export function torStatus() {
  return { enabled: TOR_ENABLED, ready: torReady, starting: !!torStarting };
}

// Poll the control port until Tor reports bootstrap PROGRESS=100 (bounded).
// The value arrives on a "250-..." header line of the GETINFO reply, so
// controlCmd must include those lines (see there).
async function waitBootstrap(t0) {
  for (;;) {
    try {
      const reply = await controlCmd("GETINFO status/bootstrap-phase");
      if (/PROGRESS[= ]100\b/.test(reply)) {
        torReady = true;
        console.log("[tor] ready (bootstrap " + Math.round((Date.now() - t0) / 1000) + "s)");
        return;
      }
    } catch { /* control port or cookie not ready yet — keep polling */ }
    if (Date.now() - t0 > BOOTSTRAP_TIMEOUT_MS) throw new Error("tor bootstrap timeout");
    await new Promise(r => setTimeout(r, 750));
  }
}

// Start Tor and wait until its control port reports a fully built bootstrap.
// Safe to call concurrently.
export function ensureTor() {
  if (torReady) return Promise.resolve();
  if (torStarting) return torStarting;
  torStarting = (async () => {
    const t0 = Date.now();
    try {
      let procDead = null;
      // Probe first: a previous wait may have timed out even though Tor
      // finished bootstrapping right after the bound. Reusing the running
      // process matters — a second Tor with the same DataDirectory refuses
      // to start, which would break the very search that triggered it.
      try { await controlCmd("GETINFO version"); }
      catch {
        try {
          fs.mkdirSync(TOR_DATA_DIR, { recursive: true });
          fs.writeFileSync(TOR_RC_FILE, [
            "SocksPort 127.0.0.1:" + TOR_SOCKS_PORT,
            "ControlPort 127.0.0.1:" + TOR_CONTROL_PORT,
            "CookieAuthentication 1",
            "DataDirectory " + TOR_DATA_DIR,
            "AvoidDiskWrites 1",
            "Log notice file " + path.join(TOR_DATA_DIR, "tor.log"),
            // Foreground child process we manage directly; Tor 0.4.9+ only
            // accepts 0/1 here ("no" is rejected and Tor exits before bootstrap).
            "RunAsDaemon 0",
          ].join("\n") + "\n");
        } catch (e) { throw new Error("tor setup: " + e.message); }
        const proc = spawn(TOR_BIN, ["-f", TOR_RC_FILE], { stdio: ["ignore", "pipe", "pipe"] });
        const onData = (d) => console.log("[tor]", d.toString().trim());
        proc.stdout.on("data", onData);
        proc.stderr.on("data", onData);
        proc.on("exit", () => { torReady = false; });
        procDead = new Promise((_, reject) => {
          proc.on("error", (e) => reject(new Error("tor start: " + (e.code === "ENOENT" ? "tor binary not found" : e.message))));
          proc.on("exit", (code) => reject(new Error("tor exited before bootstrap (code " + code + ")")));
        });
      }
      await (procDead ? Promise.race([waitBootstrap(t0), procDead]) : waitBootstrap(t0));
    } finally {
      torStarting = null;
    }
  })();
  return torStarting;
}

// Read the control cookie, tolerating Tor's two filename conventions. The
// cookie is only written once Tor has started, so resolve it here (not at
// module load) rather than relying on a single hard-coded path.
function readCookie() {
  for (const p of [TOR_COOKIE_FILE, path.join(TOR_DATA_DIR, "control_auth_cookie"), path.join(TOR_DATA_DIR, "control.authcookie")]) {
    try { return fs.readFileSync(p); } catch { /* try next */ }
  }
  return null;
}

// One command on the Tor control port (cookie auth). Resolves with the FULL
// response text; rejects on auth/timeout errors. Multi-line replies are
// "250-<data>" header + data lines + a final "250 ..." line — every part
// goes into the returned text, because GETINFO returns its value on the
// "250-..." header line (e.g. "250-status/bootstrap-phase=...PROGRESS=100").
function controlCmd(cmd) {
  return new Promise((resolve, reject) => {
    const cookie = readCookie();
    if (!cookie) return reject(new Error("no tor auth cookie"));
    const s = net.connect(TOR_CONTROL_PORT, "127.0.0.1");
    const done = (err, val) => { s.destroy(); err ? reject(err) : resolve(val); };
    let buf = "", authed = false, reply = "";
    const t = setTimeout(() => done(new Error("tor control timeout")), 8000);
    s.on("connect", () => s.write("AUTHENTICATE " + cookie.toString("hex") + "\r\n"));
    s.on("data", (d) => {
      buf += d.toString();
      let idx;
      while ((idx = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, idx); buf = buf.slice(idx + 2);
        if (!authed) {
          if (line.startsWith("250")) { authed = true; s.write(cmd + "\r\n"); }
          else return done(new Error("tor auth failed: " + line));
          continue;
        }
        if (line.startsWith("250-")) { reply += line.slice(3) + "\n"; continue; }
        if (line.startsWith("250 ") || line === "250") {
          // terminal status line — the full reply has arrived
          return done(null, reply + line);
        }
        reply += line + "\n"; // data line (circuit, ...)
      }
    });
    s.on("error", (e) => { clearTimeout(t); done(e); });
  });
}

// Rotate to a fresh circuit (new exit IP) and wait until Tor reports a built
// circuit, instead of a fixed sleep. Normally a couple of seconds; bounded so
// a stuck bootstrap can't wedge a search.
async function torNewnym() {
  await controlCmd("SIGNAL NEWNYM");
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    try {
      const reply = await controlCmd("CIRC LIST BUILT");
      // Reply: "250-" header, one line per built circuit, "250 done".
      const hasCircuit = reply.split("\n").some(l => l !== "" && !l.startsWith("250"));
      if (hasCircuit) return;
    } catch { /* control blip — keep polling */ }
    await new Promise(r => setTimeout(r, 500));
  }
}

// One HTTPS request through the local Tor SOCKS proxy via curl (Node's fetch
// cannot speak SOCKS). Returns { ok, headerRaw, bodyRaw, error }.
function torFetch(url, { method = "GET", headers = {}, body = null } = {}) {
  return new Promise((resolve) => {
    const args = ["-s", "-i", "--socks5-hostname", "127.0.0.1:" + TOR_SOCKS_PORT,
      "-m", "90", "-X", method];
    for (const [k, v] of Object.entries(headers)) args.push("-H", k + ": " + v);
    if (body) args.push("--data", body);
    args.push(url);
    const p = spawn("curl", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { err += d; });
    p.on("error", () => resolve({ ok: false, headerRaw: "", bodyRaw: "", error: err || "curl spawn failed" }));
    p.on("close", (code) => resolve({
      ok: code === 0, headerRaw: "", bodyRaw: out, error: code === 0 ? null : (err || "curl exit " + code)
    }));
  });
}

// Split a raw HTTP response ("headers\r\n\r\nbody") into its two parts.
function splitHttp(raw) {
  let i = raw.indexOf("\r\n\r\n");
  const alt = raw.indexOf("\n\n");
  if (i < 0) i = alt; else if (alt >= 0 && alt < i) i = alt;
  if (i < 0) return { headerRaw: raw, bodyRaw: "" };
  return { headerRaw: raw.slice(0, i), bodyRaw: raw.slice(i + (raw.slice(i, i + 2) === "\r\n" ? 4 : 2)) };
}

async function torLogin(acc) {
  const hashedPassword = wfPasswordHash(acc.password + "JarJarBinks9");
  const r = await torFetch(WF_BASE + "/wf/user/login/email/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: acc.email, password: hashedPassword })
  });
  if (!r.ok) { if (process.env.TOR_DEBUG) console.error("[tor:dbg] login curl fail:", r.error); return null; }
  const { headerRaw, bodyRaw } = splitHttp(r.bodyRaw);
  let b = null; try { b = JSON.parse(bodyRaw); } catch { b = null; }
  const m = headerRaw.match(/sessionid=([^;]+)/i);
  if (!m || !b || b.status === "error") {
    if (process.env.TOR_DEBUG) console.error("[tor:dbg] login parsed fail. header:", JSON.stringify(headerRaw.slice(0, 200)), "body:", JSON.stringify(bodyRaw.slice(0, 200)));
    return null;
  }
  acc.cookie = m[1];
  return acc.cookie;
}

// WordFeud password hash (sha1 of password + salt), kept in sync with
// loginAccount in server.js.
function wfPasswordHash(s) { return crypto.createHash("sha1").update(s).digest("hex"); }

// ---- Circuit health tracking --------------------------------------------
// A circuit whose exit WAF-blocked or whose curl request failed is
// "poisoned" until the next rotation. The key insight behind the speedup:
// the WordFeud limit is per-ACCOUNT, so an exit answering limit_exceed for
// account X will keep doing so — a fresh circuit cannot help THAT account.
// The caller (server.js) therefore moves to the next account immediately,
// reusing the same (healthy) exit. Only exit-level failures (WAF block,
// curl/network failure) trigger a circuit rotation + retry of the SAME
// account, replacing the old "always 2 attempts with a 6s NEWNYM between".
let poisonedCircuit = false;

function poisonCircuit() { poisonedCircuit = true; }
function clearCircuitPoison() { poisonedCircuit = false; }

// One search through Tor. Returns the result list [{id, username}] on
// success (possibly [] = "no users found"), or null on failure (tor down,
// account limited, exit blocked on both attempts, API error) so the caller
// can try the next account. `acc` is updated in place with a Tor-obtained
// session cookie.
export async function torSearch(acc, username) {
  try {
    await ensureTor();
    if (!acc.cookie) {
      // No session (first use, or it genuinely expired): log in via Tor — a
      // direct login would leave from the limited IP.
      if (!(await torLogin(acc))) { console.log("[tor] could not log in via tor"); return null; }
    }
    if (poisonedCircuit) {
      await torNewnym();
      clearCircuitPoison(); // rotated: the (new) circuit is untested but fresh
    }
    const payload = JSON.stringify({ username_or_email: username });
    const headers = { "Content-Type": "application/json", "Cookie": "sessionid=" + acc.cookie };
    // Up to 2 attempts; the second only happens after an EXIT-level failure
    // (WAF block / network) and runs on a freshly rotated circuit.
    // An account-level limit_exceed returns immediately (no point rotating).
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await torFetch(WF_BASE + "/wf/user/search/", { method: "POST", headers, body: payload });
      if (!r.ok) {
        console.log("[tor] attempt " + (attempt + 1) + ": curl failed (" + r.error + ")");
        poisonCircuit();
        if (attempt > 0) return null;
        await torNewnym(); clearCircuitPoison();
        continue;
      }
      let b = null; try { b = JSON.parse(splitHttp(r.bodyRaw).bodyRaw); } catch { b = null; }
      if (!b || typeof b !== "object") {
        console.log("[tor] attempt " + (attempt + 1) + ": no JSON (WAF block or network)");
        poisonCircuit(); // this exit is hostile — retry on a fresh one
        if (process.env.TOR_DEBUG) console.error("[tor:dbg] search raw:", JSON.stringify(r.bodyRaw.slice(0, 300)), "curl:", r.ok, r.error);
        if (attempt > 0) return null;
        await torNewnym(); clearCircuitPoison();
        continue;
      }
      const t = typeof b.content?.type === "string" ? b.content.type : "";
      if (t === "login_required") {
        // Session expired — the exit itself is fine, so re-login via Tor and
        // retry ONCE on the same circuit.
        if (!(await torLogin(acc))) { console.log("[tor] re-login via tor failed"); return null; }
        headers.Cookie = "sessionid=" + acc.cookie;
        const r2 = await torFetch(WF_BASE + "/wf/user/search/", { method: "POST", headers, body: payload });
        let b2 = null; if (r2.ok) { try { b2 = JSON.parse(splitHttp(r2.bodyRaw).bodyRaw); } catch { b2 = null; } }
        if (b2 && b2.status === "success") {
          console.log("[tor] search OK (re-login)");
          return (b2.content?.result ?? []).map(u => ({ id: u.user_id ?? u.id, username: u.username }));
        }
        return null;
      }
      if (b.status === "error" && t.includes("limit_exceed")) {
        console.log("[tor] account limited (exit fine)");
        // Account-level limit: a fresh circuit will NOT help this account,
        // so the caller should move to the next account. Keep the circuit:
        // it's a good exit — the next account can reuse it without rotating.
        return null;
      }
      if (b.status !== "success") { console.log("[tor] attempt " + (attempt + 1) + ": API error " + (t || "unknown")); return null; }
      console.log("[tor] search OK");
      return (b.content?.result ?? []).map(u => ({ id: u.user_id ?? u.id, username: u.username }));
    }
    return null;
  } catch (e) {
    console.error("[tor] fallback failed:", e.message);
    return null;
  }
}

// Fetch a user's profile created-timestamp through Tor (account-age filter).
export async function torProfile(acc, userId) {
  const r = await torFetch(WF_BASE + "/wf/user/" + userId + "/profile/", {
    headers: { "Content-Type": "application/json", "Cookie": "sessionid=" + acc.cookie }
  });
  if (!r.ok) return null;
  let b = null; try { b = JSON.parse(splitHttp(r.bodyRaw).bodyRaw); } catch { b = null; }
  return b?.content?.created ?? null;
}
