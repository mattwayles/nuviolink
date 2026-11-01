# NuvioLink

A personal website for viewing and changing the watchlists of every profile on one Nuvio account. Search or browse TMDB, add a title to any profile's watchlist, and remove titles with undo.

Not affiliated with Nuvio. This product uses the TMDB API but is not endorsed or certified by TMDB.

## Local development

```bash
npm install
cp .env.example .env.local   # then set TMDB_API_KEY
npm run dev                  # http://localhost:3000
npm test                     # unit tests (Vitest)
npm run build
```

## Deploy

Deploy to Vercel and set `TMDB_API_KEY` as a (server-side) environment variable. Do not prefix it with `NEXT_PUBLIC_`.

## Architecture

- The browser talks directly to `https://api.nuvio.tv` (CORS is open). Nuvio credentials and tokens are kept in `localStorage` and never pass through this server. Refresh tokens rotate, so refreshes are serialized across tabs with the Web Locks API.
- Sessions last until the auth server rejects the refresh token or the browser evicts `localStorage`. Other refresh failures keep the session, and the app requests persistent storage on each visit. Safari can still clear `localStorage` after 7 days of browser use without a visit; apps added to the Home Screen are not reported to have this limit.
- The password is never stored by the app. After sign-in it goes only to the browser's password manager, through `navigator.credentials.store` where supported and otherwise through form detection, which the `#sign-in` URL and read-only busy fields in `LoginForm` exist to support.
- The only server code is three stateless route handlers under `app/api/tmdb/*` (`popular`, `search`, `lookup`). They exist solely to keep `TMDB_API_KEY` secret. They are not a generic proxy: paths and parameters are fixed and validated, and errors never include the key or upstream URL.
- Library writes use only `sync_push_library_items` and `sync_delete_library_items`. The legacy full-replace `sync_push_library` is never called (a test enforces this).
