# LinkCraft v4.0 changelog

- Rebranded the app as LinkCraft, a general URL shortener.
- Added custom aliases for YouTube destinations as well as all other valid HTTP/HTTPS URLs.
- On public deployment, YouTube URLs now use LinkCraft-hosted short links when the user wants a random code or custom alias.
- On localhost, a YouTube URL without a custom alias may still return the official `youtu.be` URL; a requested custom alias correctly requires public deployment.
- Kept localhost and private-LAN addresses out of shareable custom links.
- Updated deployment guidance and fixed the long-URL placeholder.
