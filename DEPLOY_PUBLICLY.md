# Publish LinkCraft so custom links work on any network

A local website at `http://localhost:3000` is only accessible on the computer running it. LinkCraft will not generate that address as a shareable custom link. To make aliases such as `/rish` or `/inus` work over Wi-Fi or mobile data, deploy LinkCraft to a public HTTPS host.

## Render deployment

1. Push the project folder to a GitHub repository.
2. In Render, select **New → Blueprint** and connect that repository.
3. Review the service and persistent disk configured in `render.yaml` and confirm the current cost.
4. Deploy and copy the public HTTPS URL Render provides.
5. Open the deployed website, paste any HTTP/HTTPS destination (including YouTube), and check **Customize your link**.
6. Enter a short name such as `rish`; the result will look like `https://your-service.onrender.com/rish`.
7. Open that result from a phone using mobile data to test it.

The actual domain is assigned by Render and may differ from the example. If the suggested service name is already taken, choose another unique name and use the URL shown in the dashboard.

## Why not `tinyurl.com/rish` or `youtube.com/rish`?

TinyURL owns `tinyurl.com`, and YouTube owns `youtube.com`; LinkCraft cannot create arbitrary paths under either domain. The short links use the public LinkCraft deployment domain, or a custom domain that you own and connect to LinkCraft.

## Public URL configuration

Render provides `RENDER_EXTERNAL_URL` automatically. If deploying elsewhere, set `NODE_ENV=production`, `BASE_URL=https://your-public-domain.example`, and `DATA_DIR` to storage that survives restarts. Do not use localhost or a private LAN IP for `BASE_URL`.
