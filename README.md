# LinkCraft v4.0 — custom URL shortener

LinkCraft works like TinyURL: a user can paste a long URL and either receive a random short code or choose a custom ending such as `rish`, `inus`, or `my-video`.

## Example

Long URL:

`https://www.youtube.com/watch?v=mUM8pkrLRLA`

After LinkCraft is deployed publicly, the user can choose `rish` and receive a link like:

`https://linkcraft-url-shortener.onrender.com/rish`

The domain in this example is only an example; use the actual public URL assigned by your hosting provider. If you connect a domain you own, your links can use that domain instead. The short link redirects through LinkCraft, so the alias can be used for YouTube videos and other HTTP/HTTPS destinations.

**Important:** You cannot create `https://tinyurl.com/rish` through this independent app because TinyURL owns that domain. You also cannot create arbitrary paths such as `https://youtube.com/rish` because YouTube owns that domain. LinkCraft aliases are created on LinkCraft's own deployed domain (or a domain you own and connect).

## Run locally

Requirements: Node.js 20 or newer.

1. Extract/open this folder in VS Code.
2. In the terminal, run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:3000`.

Local development is only for testing the interface. For ordinary links, and for custom aliases, deploy LinkCraft first so the generated URL can open on other devices and networks. If you paste a YouTube URL locally without selecting a custom alias, LinkCraft can still give you YouTube's official `https://youtu.be/VIDEO_ID` link.

## Deploy publicly with Render

The project includes `render.yaml` for a Render Blueprint. It specifies a paid Starter web service and persistent disk; check Render's current price before confirming deployment.

1. Upload this project to a new GitHub repository.
2. In Render, choose **New → Blueprint** and connect that repository.
3. Review the service and disk shown by Render, then deploy. If the service name is unavailable, choose another unique name.
4. After deployment, open the public HTTPS URL shown by Render.
5. Paste your URL, check **Customize your link**, and enter an alias such as `rish` or `inus`.
6. The resulting URL will use the public domain, for example `https://your-service.onrender.com/rish`. Test it on mobile data or another Wi-Fi network.

Render supplies `RENDER_EXTERNAL_URL` automatically, and LinkCraft uses it in production unless `BASE_URL` is set. For other hosting providers, set `NODE_ENV=production`, `BASE_URL=https://your-public-hostname.example`, and `DATA_DIR` to a persistent storage location. Never configure `BASE_URL` as `localhost` or a private IP.

## Alias rules

- Optional custom alias: 3–24 characters.
- Accepted characters: letters, numbers, hyphens, and underscores.
- Aliases are case-insensitive for duplicate checks.
- If an alias is taken or reserved, choose another one.
- Without a custom alias, public deployments generate a random short code.
- Localhost is never emitted as a shareable custom short link.

## Security features

- Optional Google Safe Browsing URL checks using `SAFE_BROWSING_API_KEY`.
- Destination preview before each LinkCraft redirect.
- Known unsafe destinations are blocked when flagged; if an enabled scanner is unavailable, the application fails closed.
- Production HTTPS canonical URLs and HSTS.
- URL validation, rate limiting, Helmet security headers, and click counts.
- Persistent JSON storage when deployed with the included Render disk.

Without a configured Google Safe Browsing key, destinations are explicitly considered **not scanned**, not confirmed safe. No scanner can guarantee every destination is safe.

## Data and compatibility notes

- Recent-link history is stored in each browser, so it does not automatically sync between devices.
- Server links/click counts persist on the configured disk. The JSON store is intended for a single service instance; use a shared database before scaling horizontally.
- Existing links from a prior project only transfer if you intentionally migrate the old `data/links.json` to the new persistent data directory. Back up first.

## Environment variables

- `PORT`: local/default port; hosting usually sets this automatically.
- `NODE_ENV`: set to `production` on the public host.
- `BASE_URL`: public HTTPS origin when not using Render's automatic URL.
- `RENDER_EXTERNAL_URL`: automatically supplied by Render.
- `SAFE_BROWSING_API_KEY`: optional server-side Google Safe Browsing key.
- `DATA_DIR`: storage path; the Render Blueprint uses `/var/data`.
