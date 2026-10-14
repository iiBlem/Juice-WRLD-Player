# Juice WRLD Vault reconnaissance

Inspected October 13, 2026. No new player application was created. The installed application was not launched normally, modified, or updated. Its executable was run in `ELECTRON_RUN_AS_NODE` mode solely to read `process.versions`.

## Extraction and scope

- Original archive: `C:\Users\Chase H\AppData\Local\Programs\juicewrldvault-desktop\resources\app.asar`.
- Size: 2,551,465 bytes. SHA-256: `6971624bec54fd6a595cc2c9bdb028a9eb471cdc6e3e7b31bb41c473eabf9969`.
- Extracted with `npx --yes asar extract` into `recon/vault-unpacked`. This installation uses an ASAR archive, not an unpacked application folder.
- Files include `main.js`, `preload.js`, `oauthProtocol.js`, `discordPresence.js`, `offlineStore.js`, `offlineElectron.js`, `offline-ui.js`, offline HTML/CSS, assets, and production dependencies.
- Important: `main.js:381` loads `https://juicewrldvault.com`. The complete online UI and backend source are not shipped in this archive.
- Supplementary evidence: public homepage, six category pages, and their referenced JavaScript assets saved in `recon/vault-web`. These represent the live website at inspection time, not a website version pinned to the desktop release.
- Endpoint coverage is the installed shell and public homepage/category bundles, including shared player, search, authentication, collection, and staff UI code carried by those bundles. This is not an exhaustive crawl of every website route or a runtime network capture.
- REA parent Evidence: `ev_847e8337437bc49d9b7bcc7631a3c52e3004f900af7ed8694bc7cb8af54ae6a9`. Summary Evidence: `ev_36ab410ce67f02fad1d8691b2fb0ae01701441e7d927f0f84a9de5b544c5a3f7`. REA parsed 211 JavaScript files without parse failures; its semantic graph hit a 100,000-node ceiling and reports partial coverage. Focused file inspection and public read-only probes supplement that analysis.

## 1. Package and runtime

The complete shipped `package.json` is:

```json
{
  "name": "juicewrldvault-desktop",
  "version": "0.0.57",
  "description": "Juice WRLD Vault desktop app",
  "main": "main.js",
  "author": "Juice WRLD Vault",
  "license": "UNLICENSED",
  "private": true,
  "overrides": {
    "tmp": "0.2.6"
  },
  "dependencies": {
    "electron-updater": "^6.8.9",
    "electron-log": "^5.4.4"
  }
}
```

There is no `scripts`, `devDependencies`, build configuration, or Electron version declaration in this production manifest. Installed production dependency versions are electron-updater **6.8.9** and electron-log **5.4.4**. The installed executable reports Electron **42.2.0**, Chromium **148.0.7778.97**, and Node.js **24.15.0**. The main entry is `main.js`; the preload entry is `preload.js`.

## 2. External destinations and endpoint inventory

The following are application-related destinations established by call sites or configuration. Presence in source does not establish that a given destination was contacted during this investigation.

| Destination | Purpose / qualification |
| --- | --- |
| `https://juicewrldvault.com` | Hosted UI, catalogue pages, and relative API routes below |
| `https://media.juicewrldvault.com/songs/{song_path}` | Ordinary audio files when `song_path` is relative |
| `https://media.juicewrldvault.com/images/{image_path}` | Track artwork |
| `https://media.juicewrldvault.com/playlist-covers/...`, `/liked-songs/...` | Collection artwork paths supported by the image resolver |
| `https://qfsysguoaxbwhjeqkwat.supabase.co/rest/v1/...` | Public song reads and authenticated account/collection operations |
| `https://qfsysguoaxbwhjeqkwat.supabase.co/auth/v1/...` | Supabase authentication, token recovery, OAuth |
| `https://accounts.google.com/o/oauth2/v2/auth` | Allowed external Google sign-in destination |
| `https://discord.com/api/oauth2/authorize` | Allowed external Discord sign-in destination |
| `https://juicewrldvault.com/downloads/` | Configured generic Electron update feed; updater derives channel metadata and installer URLs |
| `https://juicewrldvault.com/download` | Manual Mac/Linux update page referenced in desktop dialogs |
| `https://static.cloudflareinsights.com/beacon.min.js/v4bc70e2c01a94c73b74392e4234840661791215815920` | Analytics script referenced in the captured homepage |
| `https://ko-fi.com/juicewrldvault` | Support link; not a music API |
| `https://discord.gg/bpcKzvGrad` | Community link; not a music API |

On `https://juicewrldvault.com`, the inspected bundles contain these API call sites:

| Route | Purpose |
| --- | --- |
| `/api/category-songs?category={category}&subcategory={subcategory}&offset={offset}&limit={limit}` | Category pagination; optional `search` and `era` |
| `/api/search/songs?q={query}&limit={limit}&offset={offset}` | Search |
| `/api/songs/shuffle-pool` | Shuffle IDs; also returns raw and instrumental pools |
| `/api/player/queue-songs` | POST `{ids:[...]}` to resolve queued records in batches of 100 |
| `/api/session-audio/{id}` | Audio resolver/proxy used for external session-edit paths |
| `/api/download-song?id={id}` | Downloads; native desktop delivery adds `delivery=native`; preference helper can add `format=mp3` |
| `/api/song-share-slug?id={id}` | Canonical song share URL |
| `/api/version` | Website version checking |
| `/api/desktop-update` | Website fallback for desktop update flow |
| `/api/auth/logout` | Logout |
| `/api/liked-songs/settings` | Account liked-song cover/settings |
| `/api/playlists/saves` | Own/saved playlists and saving/removing a playlist |
| `/api/player/devices` | Authenticated device discovery/control |
| `/api/listen-along/rooms` | Listen Along room operations/polling |
| `/api/presence/track` | Activity heartbeat |
| `/api/profile/recent-play` | Recent-play/listening telemetry |
| `/api/site-notifications/claim` | Account notification retrieval/acknowledgement |
| `/api/staff/songs/{id}` | Authenticated staff GET/PATCH/DELETE song editor |
| `/api/staff/lyrics-alignment-json?songId={id}` | Authenticated timing JSON download |
| `/api/staff/lyrics-alignment-json` | Authenticated timing import POST |
| `/api/staff/lyrics-import` | Authenticated Genius lyrics import POST |

Supabase SDK calls resolve under `/rest/v1/` for `songs`, `users`, `liked_songs`, `playlists`, `playlist_songs`, and `playlist_collaborators`. The playlist collaboration helper calls RPC `manage_playlist_collaboration`, mapping to `/rest/v1/rpc/manage_playlist_collaboration`. Authentication includes `/auth/v1/authorize`, `/auth/v1/token?grant_type=refresh_token`, and PKCE code exchange through the SDK. Public song reads use a shipped publishable key in `apikey`; SDK requests also construct `Authorization: Bearer ...` using the current access token or public key. Authenticated website routes commonly attach the user's access token.

Generic SDK code contains Supabase realtime/storage/functions URL construction, but this alone does not prove music playback uses those services. Dependency URLs for GitHub/Bitbucket/GitLab/S3 update providers, framework documentation, W3C namespaces, localhost SDK defaults, Core-JS tests, and `juicewrldvault.invalid` are not confirmed application destinations. `https://genius.com/...` is an input placeholder; the client sends its entered link to Vault's lyrics-import API. Source metadata URLs may describe imported files without being fetched by the player. Raw public-bundle literal hits, including such non-destinations, are retained in `recon/url-literals.json`.

Discord rich presence uses a local named pipe (`discord-ipc-{index}` on Windows), not an HTTP API. Offline playback uses the local custom protocol `jwv-offline://library/media/{id}`.

## 3. Streaming and playback

The web audio resolver is module `6822` in `vault-web/layout-3ca200fcccbc9885.js`; the media URL helper is module `266` in `4160-c898527e0d0acf0a.js`.

1. A downloaded/offline track resolves to its saved local audio URL.
2. Otherwise, a session-edit record with an absolute HTTP(S) `song_path` resolves to `/api/session-audio/{id}`. Detection examines source metadata/path strings for session-edit markers.
3. Otherwise, an absolute HTTP(S) `song_path` is used unchanged.
4. Otherwise, relative paths resolve to `https://media.juicewrldvault.com/songs/{song_path}`, with boundary slashes trimmed.

The player renders two native HTML5 `<audio preload="auto">` elements. Its custom two-deck controller assigns `audio.src`, calls `load()` and `play()`, adjusts volume for equal-power crossfades, and changes `playbackRate`/pitch-preservation properties. Media Session supplies metadata and transport controls. Inspected player code uses neither Howler nor a spawned FFmpeg playback process. A shipped `ffmpeg.dll` is not evidence of a custom FFmpeg player.

No application-defined Authorization header or token is attached when assigning the ordinary audio URL. Chromium handles media requests and ranges; applicable browser cookies may still accompany requests according to browser policy. Downloads in `offlineStore.js` use Electron `net.fetch` against `/api/download-song?id={id}&delivery=native` with an abort signal and `redirect: 'error'`, without an explicit application-defined authorization header.

Live probe: `https://media.juicewrldvault.com/songs/uploads/hate-the-other-side-instrumental-da0edb1c-cd79-4038-ba01-057ab21ef408.wav` returned **206**, `Content-Type: audio/wav`, `Accept-Ranges: bytes`, and `Content-Range: bytes 0-1023/47575154` to an unauthenticated 1,024-byte range request. This proves public byte-range delivery for that file only. Catalogue records also contain MP3 paths; this is not an MP3-only catalogue.

The sample response had no `Access-Control-Allow-Origin` header even with `Origin: http://localhost:5173`. Basic cross-origin audio playback and JavaScript-readable audio are different requirements. Renderer `fetch`, Web Audio processing, and session-proxy calls from a new local origin need separate validation. A validated Electron main-process adapter/custom media protocol is a possible solution; disabling `webSecurity` is not recommended.

## 4. Catalogue and categories

Homepage sections and the first category page of songs are delivered in Next.js HTML/React Server Component payloads. The client requests additional category pages from `/api/category-songs`, normally in batches of 30. The response shape observed is `{songs, hasMore, total, queueIds}`. Song details also load directly from Supabase `songs`, filtered by `id`; queue resolution and shuffle have their own endpoints above.

| Display | Page | API `category` | Record mapping |
| --- | --- | --- | --- |
| All music | `/` | No single all-category call established | Server-provided home sections and recent uploads |
| Unreleased | `/unreleased` | `unreleased` | `source_category: unreleased`; do not assume every unreleased record belongs in this shelf |
| Stems | `/stem` | `stem` | Stem metadata; sampled record stores `source_category: unreleased` |
| Studio Sessions | `/studio-sessions` | `studio-sessions` | Canonical record category `recording_session`; includes session edits |
| Released | `/released` | `released` | `source_category: released` |
| Remasters | `/remasters` | `remasters` | `source_category: remasters` |
| Miscellaneous | `/miscellaneous` | `miscellaneous` | `source_category: miscellaneous`, with metadata/title classification for older records |

Live read-only requests for all six API categories, `offset=0&limit=1&subcategory=`, returned HTTP 200 without login. A public Supabase song read with only `apikey` also returned HTTP 200. Details are saved in `recon/api-probes.json`.

Internal subcategories observed in the editor/classifier are `instrumental`, `raw`, `masters`, `freestyles` under miscellaneous; `stem` under unreleased; and `session_edit` under recording_session. `source_metadata.vaultCategorySelection` is preferred when valid; legacy metadata flags, aliases, and title checks provide fallback classification. Client mappings are visible; the website's server-side category query implementation is not available.

Track fields include `id`, `title`, `author`, `song_path`, `image_path`, `duration_seconds`, `length`, `source_category`, `source_metadata`, `era`, and recording/release/lyrics metadata. Imported records already reference JuiceWRLD API provenance. That does not establish direct two-server switching in Vault.

## 5. UI framework

Online UI: React with Next.js App Router, compiled webpack chunks, utility-class styling consistent with Tailwind, and CSS modules. Zustand is present and used for player/UI state. The offline UI bundled in the desktop archive is vanilla JavaScript and HTML/CSS.

Readable React/TypeScript component source, full build scripts, and Next.js server handlers are not recovered from the ASAR. Public minified browser bundles help document behavior but are not a maintainable project source tree.

## 6. State and persistence

- Zustand stores hold queue IDs, active song, shuffle, queue context, and UI state.
- `localStorage` persists `vault-player-volume`, `vault-player-last-volume`, `vault-player-repeat`, shuffle, crossfade settings, playback rate/effect/pitch mode, and `vault-player-state` (queue/current position/ownership). Player restoration checks a 24-hour state age.
- Appearance uses `vault-appearance-v1`; sidebar collapse and download preference also have localStorage keys.
- `sessionStorage` holds pending-play flags, tab ownership, and Listen Along roles. Storage events/BroadcastChannel coordinate tabs.
- Supabase auth uses cookie-backed storage/recovery plus browser storage for coordination/PKCE. The desktop shell's default persistent Chromium session keeps origin storage; launch clears cache, service workers, and CacheStorage, rather than explicitly clearing cookies/localStorage.
- Online likes/playlists are account-backed Supabase data. Removing login means these need local replacements if retained.
- Desktop user data is `%APPDATA%\JuiceWRLDVault`, unless a `--user-data-dir` override is supplied.
- Offline downloads live in `offline-v1` there: `{id}.audio`, `{id}.json`, `{id}.playlist.json`; `.part` files represent incomplete downloads. JSON writes use temporary files then rename. The store enforces ID validation, MIME checks, a 512 MB per-track limit, and a five-minute download timeout.
- No `electron-store` dependency or usage was found in the shipped application-owned files.

## Technical assessment and starting recommendation

**Streaming:** Ordinary public files are straightforward: path-based URLs and working range delivery, without a login token in the observed sample. Integration remains moderately fragile because these are private implementation interfaces rather than a documented stable API, session edits use another route, imported external URLs vary, and CORS needs origin-specific validation. No live full-track playback or session-proxy request was performed.

**Clone versus rebuild:** Reproduce layout, navigation, song shelves, search, queue, transport controls, and observed category behavior. Desktop window controls, Media Session integration, crossfade design, and offline storage are useful technical references. Build a locally packaged UI and backend adapters to own themes and server swapping. Merely loading the remote site cannot provide reliable control over its evolving navigation and authentication UI. The package is marked `UNLICENSED` and private: unpacking provides readable reference code, not a grant to redistribute it.

**Recommended starting stack:** Electron + TypeScript + React + Vite, native HTML5 audio, CSS variables for Red/Charcoal themes, and a small Zustand store for player/server state. Use local JSON persistence for app settings, likes, and playlists if account features are removed. Start without Howler, FFmpeg, a local HTTP server, or a database unless testing exposes a requirement. Vite is suitable for the locally packaged renderer; rebuilding Next.js server rendering is unnecessary for this desktop client. Keep `contextIsolation`, sandboxing, and `webSecurity` enabled, with a narrow preload bridge. See official [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security), [Vite guide](https://vite.dev/guide/), and [React documentation](https://react.dev/learn).

Each backend should supply its own category list, catalogue/search records, and audio resolution. Use `(serverId, trackId)` identities so overlapping IDs cannot mix libraries. Switching servers should stop current playback, cancel previous requests, replace the catalogue/categories, and load that server's collection state. Assess JuiceWRLD API separately before fixing its schema or claiming compatibility.

## Requirements reserved for the build

- Exclude Charts, Members, Radio, Sign up, Log in, and the top-right person icon.
- Replace the top-left icon with the user's supplied custom image at the UI build stage.
- Preserve the screenshot's request to center the main search box.
- Implement one layout with runtime-switchable Red and Charcoal themes: black base, translucent accents, backdrop blur, and subtle glass border highlights.
- The second attached image is a reference asset; no image processing or app branding work was performed.

## Remaining checks

Not checked: actual Electron/browser audio playback, all formats/tracks, session proxy availability/ranges, native downloads end to end, authenticated account features, every unrelated website route, full server implementation, or JuiceWRLD API backend behavior. The live website can change independently of the installed desktop version. No new application code was written; scripts under `recon` only fetch, inspect, and probe public reconnaissance evidence.
