# PROJECT_NOTES.md

Context file for the Juice WRLD fan mp3 player project. Every Codex session
must read this file before doing anything else.

---

## 1. What we are building

A desktop Electron music player for Juice WRLD's catalogue. It pulls from two
independent music servers and lets the user swap between them at runtime. When
the user swaps servers, the entire catalogue and its category tabs are replaced.
Playback controls work identically on both servers.

Playlists can blend tracks from both servers. When a playlist is playing, the
queue contains tracks from any server and plays through seamlessly.

Target platform: Windows (dev machine), Electron + TypeScript + React + Vite.
No paid dependencies. No backend server of our own.

---

## 2. The two servers

### Server A: juicewrldvault.com
- Integration surface: public HTTP endpoints (no auth needed for playback)
- CRITICAL: Vault has no CORS headers on its catalog API. All Vault HTTP
  requests go through an Electron IPC bridge (`window.api.vaultFetch`) that
  main process handles. Direct renderer fetch will fail.
- Catalog: `https://juicewrldvault.com/api/category-songs?category={cat}&subcategory={sub}&offset={off}&limit={lim}`
- Response shape: `{ songs: [...], hasMore: bool, total: int, queueIds: [...] }`
- Audio: `https://media.juicewrldvault.com/songs/{song_path}`
  - Confirmed: HTTP 206 with `Accept-Ranges: bytes` — scrubbing works
  - Confirmed: no auth token needed for playback
  - `<audio src>` works (media elements don't enforce CORS for playback)
- Search: `/api/search/songs?q={q}&limit={l}&offset={o}`
- Batch by ID: `/api/player/queue-songs` (POST, `{ ids: [...] }`)
- Download: `/api/download-song?id={id}&delivery=native` — via IPC bridge,
  saved to Downloads folder by main process
- Categories (six, in this order):
  `unreleased`, `stem`, `studio-sessions`, `released`, `remasters`, `miscellaneous`
- Track fields: `id`, `title`, `author`, `song_path`, `image_path`,
  `duration_seconds`, `length`, `source_category`, `source_metadata`, `era`,
  `weekly_plays`

### Server B: juicewrldapi.com
- REST base: `https://juicewrldapi.com/juicewrld/`
- CRITICAL: JuiceWRLDAPI sends CORS headers (`access-control-allow-origin: *`).
  Renderer fetch works directly. No IPC bridge needed.
- Categories: `GET /categories/`
  (returns `released`, `unreleased`, `unsurfaced`, `recording_session`)
- CATALOG FILTER: `unsurfaced` is filtered out client-side — those records
  have no audio and are not real tracks. The adapter's `listCategories()`
  drops them, and `fetchCategory('unsurfaced', ...)` returns empty.
- `recording_session` is displayed as "Studio Sessions" (label override).
- Catalog: `GET /songs/?category={cat}&page={p}&page_size={n}`
  Pagination is page/page_size. offset/limit params are silently ignored by
  the server — the adapter translates offset/limit → page/slice.
- Search: `GET /songs/?search={q}`
- Era filter: `GET /songs/?era={era_name}` — filter by name, NOT numeric id.
- Detail: `GET /songs/{id}/`
- Audio: `https://juicewrldapi.com/juicewrld/files/download/?path={urlencoded_path}`
  - Confirmed 206 range requests
  - Confirmed CORS: `access-control-allow-origin: *`
  - IMPORTANT: some records have empty `path` (unplayable). Unified Track's
    `audioUrl` is nullable and UI renders those as dimmed.
- Track fields: `id`, `public_id`, `name`, `path`, `image_url`, `length`
  (string like "3:42"), `category`, `era` (nested object with `.name`),
  `credited_artists`, `track_titles`

### Field mapping between servers
| Unified field | Vault source | JuiceAPI source |
|---|---|---|
| trackId | `vault:{id}` | `juiceapi:{id}` |
| title | `title` | `name` |
| author | `author` | `credited_artists` |
| durationSeconds | `duration_seconds` or parsed `length` | parsed `length` |
| imageUrl | `media.juicewrldvault.com/images/{image_path}` | `juicewrldapi.com{image_url}` |
| audioUrl | `media.juicewrldvault.com/songs/{song_path}` or null | `/files/download/?path={path}` or null |
| category | `source_category` | `category` |
| era | `era` (string) | `era.name` |

---

## 3. Architecture

### ServerAdapter interface
Every server implements this. The UI never talks to a server directly — it
always goes through the current adapter.

```ts
interface ServerAdapter {
  id: 'vault' | 'juiceapi';
  displayName: string;
  listCategories(): Promise<Category[]>;
  listEras?(): Promise<Era[]>;
  fetchCategory(category, offset, limit, opts?): Promise<Page<Track>>;
  search(query, offset, limit): Promise<Page<Track>>;
  getShufflePool?(opts?: ShufflePoolOptions): Promise<string[]>;
  fetchTrackById(providerTrackId: string): Promise<Track | null>;
  downloadTrack(track: Track): Promise<void>;
  resolveAudioUrl(track: Track): string | null;
}
```

## 10. Build and run commands

Run commands from the `app` directory:

```powershell
rtk proxy npm.cmd run dev
rtk proxy npm.cmd run build -- --config.electronDist=node_modules/electron/dist
```

The build runs both TypeScript checks, Vite, and electron-builder directory
packaging. The Electron distribution override uses the installed Electron
instead of downloading another copy.

Packaged executable: `app/out/win-unpacked/Juice Player.exe`.

If packaging fails with EPERM while renaming `win-unpacked.tmp` to
`win-unpacked`, close the packaged executable and stop the dev app, then retry
the build. Running processes can lock the output directory on Windows.

## 11. Current status

### Complete

- [x] "Download category" button per category
- [x] "Download All" button per server
- [x] Queue panel UI
- [x] Packaged .exe runtime behavior verified (user confirmed)
- [x] Toast/queue stacking under simultaneous open (fixed this session;
      user confirmed checks a–d passed)
- [x] Session 17 queue verification: checks a–k passed, including keeping the
      currently playing track playing when its row is removed; an empty queue
      stops playback.

### Not yet built

- [ ] Era filter UI (deferred indefinitely — only JuiceWRLDAPI has eras,
      low priority)

### Not yet verified

No outstanding verification items recorded for this session.
