# AI Agent Readiness Scanner (MVP)

Cloudflare Pages-project dat scant of een website klaar is voor AI-agents, crawlers en answer engines. Gebaseerd op de publieke 21-checks specificatie van isitagentready.com, zelf geimplementeerd als Cloudflare Pages Function.

## Deploy

1. Koppel deze GitHub-repo aan Cloudflare Pages.
2. Gebruik de root als output directory en geen build command.
3. De Pages Function wordt automatisch beschikbaar op `/api/scan`.
4. Koppel eventueel een custom domain zoals `scan.aiwebscan.nl`.

## Test

Open de frontpage en voer een URL in, of gebruik:

`GET /api/scan?url=https%3A%2F%2Fexample.com`

De scanner controleert robots.txt, sitemap, Link headers, DNS-AID, Markdown Negotiation, botregels, Content Signals, Web Bot Auth, MCP/A2A/Skills/API discovery en OAuth-signalen. Commerce-protocollen zijn in deze MVP placeholders.

## Volgende stappen

- KV-cache en rate limiting toevoegen.
- Historische scanresultaten opslaan.
- Diepere UCP/ACP-validatie toevoegen.
- Agent-format output met `text/markdown` implementeren.
