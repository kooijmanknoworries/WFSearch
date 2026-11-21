// Local fake environment for the Tor fallback e2e test (no real Tor needed):
//  - mock A (127.0.0.1:19101): the "direct" WordFeud API — login works, but
//    every search returns limit_exceed (the server IP is rate-limited).
//  - mock B (127.0.0.1:19102): the "via Tor" WordFeud API — search succeeds
//    for tokB, returns limit_exceed for tokA (a rate-limited account, which
//    stays limited even through a fresh exit).
//  - minimal SOCKS5 proxy (127.0.0.1:19050) that tunnels every CONNECT to
//    mock B (so "via Tor" == "mock B").
//  - fake Tor control port (127.0.0.1:19051): AUTHENTICATE / GETINFO
//    status/bootstrap-phase (PROGRESS=100) / SIGNAL NEWNYM / CIRC LIST BUILT.
//  - stats/control HTTP API (127.0.0.1:19200) for the e2e script:
//      GET  /stats        -> counters + request logs
//      POST /waf-next     -> next Tor search response is an HTML WAF block
// Node 22, no dependencies.
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

const MOCK_A = Number(process.env.FAKE_MOCK_A || 19101);
const MOCK_B = Number(process.env.FAKE_MOCK_B || 19102);
const SOCKS = Number(process.env.FAKE_SOCKS || 19050);
const CONTROL = Number(process.env.FAKE_CONTROL || 19051);
const API = Number(process.env.FAKE_API || 19200);
const DATA_DIR = process.env.FAKE_TOR_DATA_DIR || "/tmp/wftest/tor";
// Where the SOCKS tunnel forwards to ("the Tor exit"). Defaults to mock B;
// override in tests to point at a capture server.
const SOCKS_TARGET_HOST = process.env.FAKE_SOCKS_TARGET_HOST || "127.0.0.1";
const SOCKS_TARGET_PORT = Number(process.env.FAKE_SOCKS_TARGET_PORT || MOCK_B);

const state = {
  newnyms: 0,
  bootstraps: 0,
  torReqs: [],     // { path, cookie, query, ts }
  directReqs: [],  // { path, cookie, ts }
  wafNext: false,
};

const EMAIL_TOKEN = { "a@test.com": "tokA", "b@test.com": "tokB" };
const tokenFor = (email) => EMAIL_TOKEN[email] || "tokU";

function httpJson(res, obj, extraHeaders = {}) {
  res.writeHead(200, { "Content-Type": "application/json", ...extraHeaders });
  res.end(JSON.stringify(obj));
}

function makeMock(port, kind) {
  return http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => body += d);
    req.on("end", () => {
      const cookie = (req.headers.cookie || "").match(/sessionid=(\w+)/)?.[1] || "";
      let query = "";
      try { query = JSON.parse(body || "{}").username_or_email || ""; } catch {}
      const log = { path: req.url, cookie, ts: Date.now() };
      if (kind === "tor") { log.query = query; state.torReqs.push(log); }
      else state.directReqs.push(log);

      if (req.url.endsWith("/login/email/")) {
        let email = "";
        try { email = JSON.parse(body || "{}").email || ""; } catch {}
        return httpJson(res, { status: "success", content: {} },
          { "Set-Cookie": "sessionid=" + tokenFor(email) + "; Path=/; HttpOnly" });
      }
      if (req.url.endsWith("/search/")) {
        if (kind === "direct") {
          return httpJson(res, { status: "error", content: { type: "limit_exceed" } });
        }
        if (state.wafNext) {
          state.wafNext = false;
          res.writeHead(403, { "Content-Type": "text/html" });
          return res.end("<html><body>Access denied (WAF)</body></html>");
        }
        if (cookie === "tokA") {
          return httpJson(res, { status: "error", content: { type: "limit_exceed" } });
        }
        return httpJson(res, { status: "success", content: { result: [{ user_id: 12345, username: query }] } });
      }
      if (/^\/wf\/user\/\d+\/profile\//.test(req.url)) {
        return httpJson(res, { status: "success", content: { created: "2021-05-01T00:00:00Z" } });
      }
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end("{}");
    });
  });
}

// Minimal SOCKS5: one no-auth method, CONNECT only, IPv4/hostname reply.
// Every connection is tunnelled to mock B ("the Tor exit"). Client data that
// arrives before the upstream connection is established is buffered and
// flushed on connect — curl sends the HTTP request immediately after the
// SOCKS reply, which can race the tunnel setup.
function socksProxy() {
  const srv = net.createServer((sock) => {
    let stage = 0; // 0 = greeting, 1 = CONNECT request, 2 = tunnelled
    let buf = Buffer.alloc(0);
    let pending = Buffer.alloc(0); // client bytes not yet sent upstream
    let upstream = null;
    sock.on("data", (d) => {
      if (stage === 2) {
        // Piping is live only once the upstream connect fired; until then
        // buffer (the client often sends its request before the tunnel up).
        if (upstream && !sock._tunnelled) pending = Buffer.concat([pending, d]);
        return;
      }
      buf = Buffer.concat([buf, d]);
      if (stage === 0) {
        if (buf.length < 2) return;
        const n = buf[1];
        if (buf.length < 2 + n) return;
        sock.write(Buffer.from([5, 0])); // pick "no authentication"
        buf = buf.slice(2 + n);
        stage = 1;
      }
      if (stage === 1) {
        // request: VER CMD RSV ATYP [ADDR] PORT — 4-byte prefix, then
        // address (4 / 1+len / 16 bytes), then 2-byte port.
        if (buf.length < 4) return;
        const atyp = buf[3];
        let addrLen;
        if (atyp === 1) addrLen = 4;
        else if (atyp === 3) { if (buf.length < 5) return; addrLen = buf[4] + 1; }
        else if (atyp === 4) addrLen = 16;
        else { sock.destroy(); return; }
        if (buf.length < 4 + addrLen + 2) return;
        // 10-byte reply, ATYP=1 (IPv4), 0.0.0.0:0 — required or curl hangs.
        sock.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
        // Consume the CONNECT request itself; anything that arrived after it
        // (rare) goes into the pending buffer.
        pending = buf.slice(4 + addrLen + 2);
        buf = Buffer.alloc(0);
        stage = 2;
        upstream = net.connect(SOCKS_TARGET_PORT, SOCKS_TARGET_HOST);
        upstream.on("connect", () => {
          if (pending.length) upstream.write(pending);
          pending = Buffer.alloc(0);
          sock._tunnelled = true;
          sock.pipe(upstream);
          upstream.pipe(sock);
        });
        upstream.on("error", () => sock.destroy());
        sock.on("error", () => upstream.destroy());
      }
    });
    sock.on("error", () => {});
  });
  srv.listen(SOCKS, "127.0.0.1");
}

function controlServer() {
  const srv = net.createServer((s) => {
    let buf = "";
    let authed = false;
    s.on("data", (d) => {
      buf += d.toString();
      let idx;
      while ((idx = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, idx); buf = buf.slice(idx + 2);
        if (!authed) {
          if (line.startsWith("AUTHENTICATE")) { authed = true; s.write("250 OK\r\n"); }
          else s.write("515 authentication required\r\n");
          continue;
        }
        if (line.startsWith("SIGNAL NEWNYM")) {
          state.newnyms++;
          s.write("250 OK\r\n");
        } else if (line.startsWith("GETINFO status/bootstrap-phase")) {
          state.bootstraps++;
          // Real Tor answers GETINFO with a multi-line "250-..." header
          // carrying the value, then a terminal "250 done" line.
          s.write("250-status/bootstrap-phase=NOTICE BOOTSTRAP=1 DONE PROGRESS=100 TAG=done\r\n250 done\r\n");
        } else if (line.startsWith("CIRC LIST BUILT")) {
          s.write("250-\r\nS 0~1234 BUILT 1.2.3.4 9001 5.6.7.8 80\r\n250 done\r\n");
        } else s.write("250 OK\r\n");
      }
    });
    s.on("error", () => {});
  });
  srv.listen(CONTROL, "127.0.0.1");
}

function statsApi() {
  http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/stats") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(state));
    }
    if (req.method === "POST" && req.url === "/waf-next") {
      state.wafNext = true;
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end('{"ok":true}');
    }
    res.writeHead(404); res.end("");
  }).listen(API, "127.0.0.1");
}

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(path.join(DATA_DIR, "control_auth_cookie"), crypto.randomBytes(32));
makeMock(MOCK_A, "direct").listen(MOCK_A, "127.0.0.1");
makeMock(MOCK_B, "tor").listen(MOCK_B, "127.0.0.1");
socksProxy();
controlServer();
statsApi();
console.log("[fake-env] ready (mocks " + MOCK_A + "/" + MOCK_B + ", socks " + SOCKS + ", control " + CONTROL + ")");
