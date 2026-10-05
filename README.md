# WordFeud Gallery

Zoek WordFeud gebruikersnamen en beheer galerijen van gevonden profielen.

## Features

- **Naamzoekfunctie** — Zoek gebruikers via de WordFeud API
- **Achternaam + nummer combinaties** — Automatiseert zoeken naar `Naam1971` tot `Naam1985`, `Naam0` tot `Naam9`, en `Naam1`/`Naam12`/`Naam123`/`Naam1234`/`Naam12345`
- **Scheidingstekens** — Zoekt met spatie, underscore, hash, en koppelteken (bijv. `Wendy_1981`, `Eva#1970`, `Judith-1`)
- **Dutch names dropdown** — A-Z filter met veelvoorkomende Nederlandse voornamen
- **Populaire namen dropdown** — Top 500 meest voorkomende Nederlandse meisjesnamen (CBS data)
- **Galerijbeheer** — Bewaar, laad en verwijder galerijen (localStorage)
- **Invite-markering** — Markeer profielen als "uitgenodigd" (blijft behouden over sessies heen)
- **Account leeftijd filter** — Stel maximaal aantal jaren/dagen in om oudere accounts te filteren
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

Geen configuratie nodig. WordFeud authenticatie wordt automatisch afgehandeld door de server.

## Bestandsstructuur

```
server.js     # Al heten: server, API, frontend
.gitignore    # Negeer logbestanden en temp directories
```

## Technieken

- Node.js 22+
- Single-file applicatie (geen dependencies nodig)
- localStorage voor galerij persistentie
- WordFeud REST API
