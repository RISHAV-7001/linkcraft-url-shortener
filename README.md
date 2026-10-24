# LinkCraft URL Shortener v4.1 (free-hosting ready)

LinkCraft lets users shorten HTTP/HTTPS URLs, choose a custom alias (such as `/rish`), preview a destination before continuing, view click statistics, and optionally check known threats with Google Safe Browsing.

## Run locally

Requirements: Node.js 20 or newer.

```bash
npm install
npm start
```

Open http://localhost:3000. Locally, short-link storage uses `data/links.json`; public links require deploying the site to a public HTTPS host.

## Public deployment without paid Render compute

Use Render's Free web-service plan and Neon PostgreSQL for persistent link data. Follow [`DEPLOY_PUBLICLY.md`](DEPLOY_PUBLICLY.md). The included `render.yaml` uses `plan: free`, has no paid disk, and prompts you to provide `DATABASE_URL` at initial Blueprint creation.

## Security notes

- Only HTTP and HTTPS destination URLs are accepted.
- Custom aliases are validated and reserved paths are blocked.
- Security headers and rate limiting are enabled.
- Destination previews run before redirects.
- Configure `SAFE_BROWSING_API_KEY` to enable actual Google Safe Browsing checks. Without it, destinations are marked **not scanned**.
- Keep database URLs and API keys out of source control.

## Environment variables

- `DATABASE_URL` — required in production; PostgreSQL connection URL. Optional locally.
- `BASE_URL` — optional public origin; on Render the app uses `RENDER_EXTERNAL_URL` automatically.
- `SAFE_BROWSING_API_KEY` — optional Google Safe Browsing key.
- `PORT` — provided automatically by Render.
