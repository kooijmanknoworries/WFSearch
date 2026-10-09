// Tor fallback for the WordFeud rate limit (see /search in server.js).
// WordFeud limits per IP; when this server's IP is limited, requests are
// routed through a local Tor circuit so they leave from a different exit IP.
// Tor is a child process, started lazily on first use, bound to 127.0.0.1
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
const TOR_COOKIE_FILE = path.join(TOR_DATA_DIR, "control.authcookie");
const TOR_BIN = fs.existsSync("/usr/sbin/tor") ? "/usr/sbin/tor" : "tor";
const WF_BASE = process.env.WF_BASE_URL || "https://api.wordfeud.com";

let torReady = false;
let torStarting = null;

export function torStatus() {
  return { enabled: TOR_ENABLED, ready: torReady, starting: !!torStarting };
}

// Start Tor and wait (up to ~40s) until its control port reports a fully
// built bootstrap. Safe to call concurrently.
export function ensureTor() {
  if (torReady) return Promise.resolve();
  if (torStarting) return torStarting;
  torStarting = new Promise((resolve, reject) => {
    let settled = false;
    const fail = (e) => { if (!settled) { settled = true; torStarting = null; reject(e); } };
    try {
      fs.mkdirSync(TOR_DATA_DIR, { recursive: true });
      fs.writeFileSync(TOR_RC_FILE, [
        "SocksPort 127.0.0.1:" + TOR_SOCKS_PORT,
        "ControlPort 127.0.0.1:" + TOR_CONTROL_PORT,
        "CookieAuthentication 1",
        "DataDirectory " + TOR_DATA_DIR,
        "AvoidDiskWrites 1",
        "Log notice file " + path.join(TOR_DATA_DIR, "tor.log"),
        "RunAsDaemon no",
      ].join("\n") + "\n");
    } catch (e) { return fail(new Error("tor setup: " + e.message)); }
    const proc = spawn(TOR_BIN, ["-f", TOR_RC_FILE], { stdio: ["ignore", "pipe", "pipe"] });
    proc.on("error", (e) => fail(new Error("tor start: " + (e.code === "ENOENT" ? "tor binary not found" : e.message))));
    proc.on("exit", () => {
      torReady = false;
      if (!settled) fail(new Error("tor exited before bootstrap"));
    });
    const onData = (d) => console.log("[tor]", d.toString().trim());
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
    // Tor logs bootstrap progress to its log file (not stdout), so poll the
    // control port: once it answers, wait for "PROGRESS 100".
    const t0 = Date.now();
    const poll = setInterval(async () => {
      try {
        const line = await controlCmd("GETINFO status/bootstrap-phase");
        if (line.includes("PROGRESS 100")) {
          clearInterval(poll);
          settled = true; torReady = true; torStarting = null;
          console.log("[tor] ready (bootstrap " + Math.round((Date.now() - t0) / 1000) + "s)");
          resolve();
        }
      } catch {
        // control port not up (or cookie not written) yet — keep polling
      }
      if (Date.now() - t0 > 40000) {
        clearInterval(poll);
        fail(new Error("tor bootstrap timeout"));
      }
    }, 750);
  });
  return torStarting;
}

// One command on the Tor control port (cookie auth). Resolves with the first
// response line; rejects on auth/timeout errors.
function controlCmd(cmd) {
  return new Promise((resolve, reject) => {
    let cookie;
    try { cookie = fs.readFileSync(TOR_COOKIE_FILE); }
    catch (e) { return reject(new Error("no tor auth cookie: " + e.message)); }
    const s = net.connect(TOR_CONTROL_PORT, "127.0.0.1");
    const done = (err, val) => { s.destroy(); err ? reject(err) : resolve(val); };
    let buf = "", authed = false;
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
        clearTimeout(t);
        return done(null, line);
      }
    });
    s.on("error", (e) => { clearTimeout(t); done(e); });
  });
}

// Rotate the circuit so the next request leaves from a new exit IP, then give
// Tor a moment to build it.
async function torNewnym() {
  await controlCmd("SIGNAL NEWNYM");
  await new Promise(r => setTimeout(r, 6000));
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

// One search through a (possibly new) Tor circuit. Up to 2 attempts; the
// second uses a fresh circuit (SIGNAL NEWNYM). Returns the result list
// [{id, username}] on success, or null on any failure (tor down, exit
// blocked, exit itself limited, API error). `acc` is updated in place with
// a Tor-obtained session cookie.
export async function torSearch(acc, username) {
  try {
    await ensureTor();
    if (!acc.cookie) {
      // Session dropped (or first use): log in via Tor — a direct login would
      // leave from the same limited IP.
      if (!(await torLogin(acc))) { console.log("[tor] could not log in via tor"); return null; }
    }
    const payload = JSON.stringify({ username_or_email: username });
    const headers = { "Content-Type": "application/json", "Cookie": "sessionid=" + acc.cookie };
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await torNewnym();
      const r = await torFetch(WF_BASE + "/wf/user/search/", { method: "POST", headers, body: payload });
      if (!r.ok) { console.log("[tor] attempt " + (attempt + 1) + ": curl failed (" + r.error + ")"); continue; }
      let b = null; try { b = JSON.parse(splitHttp(r.bodyRaw).bodyRaw); } catch { b = null; }
      if (!b || typeof b !== "object") {
        console.log("[tor] attempt " + (attempt + 1) + ": no JSON (WAF block or network)");
        if (process.env.TOR_DEBUG) console.error("[tor:dbg] search raw:", JSON.stringify(r.bodyRaw.slice(0, 300)), "curl:", r.ok, r.error);
        continue;
      }
      const t = typeof b.content?.type === "string" ? b.content.type : "";
      if (t === "login_required") {
        // Session not valid for this exit — log in via Tor and retry inline.
        if (!(await torLogin(acc))) { console.log("[tor] login via tor failed"); continue; }
        headers.Cookie = "sessionid=" + acc.cookie;
        const r2 = await torFetch(WF_BASE + "/wf/user/search/", { method: "POST", headers, body: payload });
        let b2 = null; if (r2.ok) { try { b2 = JSON.parse(splitHttp(r2.bodyRaw).bodyRaw); } catch { b2 = null; } }
        if (b2 && b2.status === "success") {
          console.log("[tor] search OK (re-login, circuit " + (attempt + 1) + ")");
          return (b2.content?.result ?? []).map(u => ({ id: u.user_id ?? u.id, username: u.username }));
        }
        continue;
      }
      if (b.status === "error" && t.includes("limit_exceed")) { console.log("[tor] attempt " + (attempt + 1) + ": exit also limited"); continue; }
      if (b.status !== "success") { console.log("[tor] attempt " + (attempt + 1) + ": API error " + (t || "unknown")); continue; }
      console.log("[tor] search OK (circuit " + (attempt + 1) + ")");
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
