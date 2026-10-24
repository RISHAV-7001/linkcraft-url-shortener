# Changelog

## v4.1.0
- Changed Render Blueprint to the Free web-service plan.
- Removed the paid persistent disk that caused Render to require payment information.
- Added PostgreSQL persistence via `DATABASE_URL` for hosted deployments; local development still uses JSON storage.
- Production startup now refuses to run without a database URL, preventing silent loss of short links on Render's ephemeral filesystem.
- Added free deployment instructions for connecting Neon PostgreSQL.

## v4.0.0
- Custom aliases, public-host URL generation, destination previews, click stats, and optional Safe Browsing.
