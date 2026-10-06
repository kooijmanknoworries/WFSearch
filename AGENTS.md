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
