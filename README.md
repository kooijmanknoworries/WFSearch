# WordFeud Gallery (WFSearch)

Zoek WordFeud gebruikersnamen en beheer galerijen van gevonden profielen.
Zoekt via de WordFeud API met automatisch gegenereerde naam- en nummercombinaties,
met een **Tor-fallback** die doorkomt wanneer een account rate-limited is.

> **Ontwikkelaars / AI-agents:** lees [`ARCHITECTURE.md`](./ARCHITECTURE.md) voor de
> volledige referentie (API, account- & rate-limitmodel, Tor, testing, deploy) en
> [`AGENTS.md`](./AGENTS.md) voor de korte regels.

## Features

- **Naamzoekfunctie** — Zoek gebruikers via de WordFeud API
- **Achternaam + nummer combinaties** — Automatiseert zoeken naar `Naam1971` tot `Naam1985`, `Naam0` tot `Naam9`, en `Naam1`/`Naam12`/`Naam123`/`Naam1234`/`Naam12345`
- **Scheidingstekens** — Zoekt met spatie, underscore, hash, en koppelteken (bijv. `Wendy_1981`, `Eva#1970`, `Judith-1`)
- **Dutch names dropdown** — A-Z filter met veelvoorkomende Nederlandse voornamen
- **Populaire namen dropdown** — Top 500 meest voorkomende Nederlandse meisjesnamen (CBS data)
- **Galerijbeheer** — Bewaar, laad en verwijder galerijen (localStorage)
- **Invite-markering** — Markeer profielen als "uitgenodigd" (blijft behouden over sessies heen)
- **Account leeftijd filter** — Stel maximaal aantal jaren/dagen in om oudere accounts te filteren
- **Foto's verbergen** — Eén-klikknop om alle galerijfoto's te verbergen (blijft onthouden)
- **Meerdere accounts** — Voeg WordFeud-accounts toe en wissel van "preferred" account
- **Rate-limit + Tor-fallback** — Detecteert `limit_exceed` en zoekt automatisch via een lokale Tor-circuit + account-rotatie; live afteller in de UI
- **Zoekresultaten banner** — Toont statistieken en blijft zichtbaar tot de volgende zoekopdracht
- **API error weergave** — Rode banner bij API fouten

## Installatie

```bash
# Clone de repository
git clone https://github.com/kooijmanknoworries/WFSearch.git
cd WFSearch

# Start de applicatie (Node.js 22+ vereist)
node server.js
```

App draait op `http://localhost:8011`

## Configuratie

Geen configuratie nodig. WordFeud authenticatie wordt automatisch afgehandeld door
de server. Optionele environment variables (zie `ARCHITECTURE.md` §8): `PORT`,
`TOR_ENABLED` (stel op `0` om de Tor-fallback uit te zetten), `TOR_DEBUG`.

## Self-hosting (Docker)

```bash
cd ~/WFSearch
git pull
docker compose -f compose.selfhost.yaml up -d --build
```

`restart: unless-stopped` + enabled Docker/Caddy zorgt dat alles na een reboot
terugkomt. Zie `ARCHITECTURE.md` §8 voor URL's en details.

## Testen

```bash
node tests/e2e_tor_speedup.js   # Tor-pad e2e, geen echte Tor nodig
```

## Bestandsstructuur

```
server.js               # Server, API, account-/rate-limit logic, inlined frontend
tor.js                  # Tor subprocess + control protocol + Tor-routed fetch/login/search
tests/                  # e2e Tor test + mock-omgeving (fake WordFeud, SOCKS5, control)
Dockerfile              # node:22-alpine + tor + curl
compose.selfhost.yaml   # Self-hosted compose service
ARCHITECTURE.md         # Volledige ontwerpreferentie (API, rate-limit, Tor, deploy)
AGENTS.md               # Korte regels voor AI-agents
AI-ONBOARDING.md        # Plakbaar prompt om elke AI-model correct te onboarden
```

## Technieken

- Node.js 22+
- Single-file applicatie (geen runtime-dependencies)
- Inlined frontend (HTML/CSS/JS), localStorage voor galerij persistentie
- WordFeud REST API; Tor-fallback via lokale SOCKS5 + `curl`
- Geen `package.json` (ESM via Node 22 detect-module)
