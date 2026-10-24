# Free public deployment (Render + Neon)

This version uses a Render **Free** web service and an external PostgreSQL database so short links are not stored on Render's temporary filesystem.

## Before deploying

1. Push this updated project to your existing GitHub repository `RISHAV-7001/linkcraft-url-shortener`.
2. Create a Neon PostgreSQL project at https://neon.tech/ (Free plan is sufficient for a small demo; review its current limits and pricing).
3. In Neon, open **Connect**, select your project/database/role, and copy the PostgreSQL connection string. Keep it secret; do not put it in GitHub or a committed `.env` file.
4. In Render, open **New → Blueprint** and choose the same GitHub repository and `main` branch. The updated `render.yaml` defines `plan: free`, no paid disk, and asks for `DATABASE_URL` during first Blueprint creation. Paste the Neon connection string when prompted.
5. Review the resource plan before deploying. It should show a **Free** web service and no persistent disk. If it shows a paid plan or asks for card details again, stop and do not confirm; verify that the updated `render.yaml` is present on GitHub's `main` branch.
6. Deploy. Render will set `RENDER_EXTERNAL_URL`; generated links will use the public HTTPS service domain automatically.

## Important limitations

- Render Free web services spin down after 15 minutes idle and can take about a minute to wake. They have an ephemeral filesystem, so this version stores production links in Neon PostgreSQL.
- The app intentionally refuses to start in production without `DATABASE_URL`, to avoid silently losing links after a restart.
- Free database services/providers have usage, storage, and compute limits. Check current plan terms before using this for anything important.
- If Google Safe Browsing is not configured, the app labels destinations as **not scanned**; it does not claim they are safe.

## Local development

Run `npm install`, then `npm start`. Without `DATABASE_URL`, local development uses `data/links.json`. Do not commit `.env` or database passwords.
