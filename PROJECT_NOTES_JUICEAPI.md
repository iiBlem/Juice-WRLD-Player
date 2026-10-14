# JuiceWRLDAPI reconnaissance — pass 2

Captured October 13, 2026 (UTC). This pass contains read-only public HTTP probes and inspection of the Python wrapper and public website JavaScript. No application code was written. All probe scripts and response captures are under `recon/juiceapi/`.

## Findings in brief

JuiceWRLDAPI exposes a documented JSON REST API. The Python wrapper makes HTTP requests to it; it does not scrape HTML. The minimal integration is a catalogue request followed by assigning a path-based download URL to a native HTML audio element. One anonymous MP3 request returned `206 Partial Content` for the requested 64 bytes, with public CORS headers and no redirect.

Streaming is straightforward when a record has a populated `path`. Catalogue coverage is less straightforward: some entries are metadata only, the older wrapper's player route now returns 404, and the API uses page pagination rather than Vault's offsets. These differences must remain inside the server adapter.

## 1. Actual API and documentation

- Origin: `https://juicewrldapi.com`
- REST base: `https://juicewrldapi.com/juicewrld/`
- Current site API documentation: [API docs](https://juicewrldapi.com/api-docs). The SPA route and its documentation content are present in the fetched `site-index.js` and `ApiDocsPage.3a0a78fb.js` bundles. `/docs` is the site introduction/guide, not the API reference. An HTML response to these routes is expected: documentation renders in the browser.
- Python package: [juicewrld-api-wrapper](https://pypi.org/project/juicewrld-api-wrapper/), version 1.0.4. Its repository describes it as the official wrapper; independent confirmation of ownership was not established.
- Wrapper source: [HackinHood/juicewrld-api-wrapper](https://github.com/HackinHood/juicewrld-api-wrapper), inspected at commit `6f54b5f98532c5ffb3a0bc716044147175dad2e8`. [Endpoint reference at that commit](https://github.com/HackinHood/juicewrld-api-wrapper/blob/6f54b5f98532c5ffb3a0bc716044147175dad2e8/API_ENDPOINTS.md).

The wrapper's `JuiceWRLDAPI` uses `requests.Session`, issues `session.request(...)`, and parses `response.json()`. Defaults include `Accept: application/json` and `User-Agent: JuiceWRLD-API-Wrapper/1.0.4`. There is no HTML parser or login/API-key handshake in this client. The live catalogue, detail, era, file lookup, and sampled streaming requests succeeded without Authorization or cookies. No claim is made about authentication for administrative/write endpoints.

The public REST service is the integration surface; no page scraping or Python runtime is required. Its private database implementation cannot be determined from these public responses. Names such as `original_key` do not prove how the current backend stores data.

### Endpoint inventory and evidence level

All paths below are relative to `/juicewrld/`. "Documented" means source documentation was inspected, not that every endpoint was called.

| Method/path | Purpose | Evidence |
|---|---|---|
| `GET /` | API overview and resource links | Live 200 JSON |
| `GET /categories/` | Category values and labels | Live 200 JSON |
| `GET /songs/?category=...&page=...&page_size=...` | Catalogue | Live 200 for all four categories |
| `GET /songs/?search=...` | Search names/aliases/artist metadata | Live 200; current docs describe name, credited artist, and track-title search |
| `GET /songs/?era=...` | Era filter, using the era name | Live 200 with `jute` |
| `GET /songs/{id}/` | Full track metadata | Live 200 for internal ID and sampled public ID |
| `GET /eras/` | Paginated era records | Both live pages captured |
| `GET /files/download/?path=...` | Stream or download a file | Live 206 for one MP3 range |
| `GET /files/info/?path=...` | Size, MIME type, timestamps | Live 200 |
| `GET /files/browse/?path=...&search=...` | Directory listing/recursive file search | Live 200 with two matches |
| `GET /artists/`, `/artists/{id}/`, `/albums/`, `/albums/{id}/`, `/eras/{id}/`, `/stats/` | Additional metadata | Wrapper documentation; not separately probed |
| `GET /versions/` | Versions resource | Linked by live API overview; not probed |
| `GET /files/cover-art/?path=...` | File artwork | Wrapper documentation; not probed |
| `GET /radio/random/` | Random playable file with optional song metadata | Current website source/docs; not probed |
| `POST /files/zip-selection/`, `/files/start-zip-job/`, `/files/cancel-zip-job/{job_id}/`; `GET /files/zip-job-status/{job_id}/` | ZIP operations | Wrapper documentation; not called |
| `GET /player/songs/`, `/player/songs/{id}/` | Older player catalogue/detail | Wrapper documentation; list endpoint returned **404**; detail not probed |

Current website docs also describe `searchall`, `lyrics`, and `file_names_array` song query parameters. These were not live-tested. Wrapper documentation describes rate limits, but no rate-limit test was performed; do not treat its numbers as a verified current contract.

Live API resource links and `next`/`previous` URLs sometimes use `http://juicewrldapi.com` even when the request uses HTTPS. Construct pagination URLs on the known HTTPS base, or normalize and validate same-origin links before following them.

## 2. Catalogue, categories, eras, identifiers

### Categories

`GET /juicewrld/categories/` returned:

```json
{
  "categories": [
    {"value": "released", "label": "Released"},
    {"value": "unreleased", "label": "Unreleased"},
    {"value": "unsurfaced", "label": "Unsurfaced"},
    {"value": "recording_session", "label": "Recording Session"}
  ]
}
```

The site documentation labels `recording_session` as **Studio Sessions**, while the live category endpoint says **Recording Session**. These are the same API category value.

| UI category | List request | Observed total | Availability caveat |
|---|---|---:|---|
| Studio Sessions | `/songs/?category=recording_session&page=1&page_size=1` | 511 | First sampled record had empty `path` and `length` |
| Released | `/songs/?category=released&page=1&page_size=1` | 325 | First sampled record had an MP3 path |
| Unreleased | `/songs/?category=unreleased&page=1&page_size=2` | 1,500 | Sampled `2MININHELL` had a working MP3 path |
| Unsurfaced | `/songs/?category=unsurfaced&page=1&page_size=1` | 413 | First sampled record had empty `path` and `length` |

Counts are a capture-time snapshot, not a fixed schema. One empty-path example does not establish that an entire category is unplayable. Conversely, catalogue count is not playable-file count. The current website player filters records with empty/whitespace `path` after fetching a page.

### Response and pagination

Song lists and search use:

```json
{
  "count": 1500,
  "next": "http://juicewrldapi.com/juicewrld/songs/?category=unreleased&page=2&page_size=2",
  "previous": null,
  "results": ["full track objects, abbreviated here"]
}
```

`page` is one-based; default `page_size` is 20. Page 1 and page 2 with size 2 returned different records. A request containing `offset=1&limit=1` still returned 20 records starting at the first track: **these parameters are ignored**. Maximum page size and stable ordering during concurrent catalogue updates were not tested.

For the existing proposed `fetchCategory(category, offset, limit)` adapter, translate offsets into page requests and slice the results. A single page is sufficient only when the requested offset aligns with its page boundary; otherwise fetch the necessary page(s). The wrapper's `search_songs` uses `(offset // limit) + 1` without slicing, so it does not implement arbitrary offsets correctly.

### Eras

`GET /juicewrld/eras/` returned `{count,next,previous,results}`, with 34 eras: 20 on page 1 and 14 on page 2. Era records contain `id`, `name`, `description`, `time_frame`, and `play_count`.

Sample:

```json
{
  "id": 101,
  "name": "jute",
  "description": "JUICED UP THE EP",
  "time_frame": "January 2014 - January 30th 2016",
  "play_count": 34107
}
```

`GET /songs/?category=unreleased&era=jute&page=1&page_size=1` returned 27 matches. The same filter with `era=101` returned zero. Use `era.name` as the filter value and preserve the full nested era object as server metadata. An era is a separate facet, not a replacement for the category.

### Track identity and record

The sampled track has internal integer `id: 94316` and nullable legacy/public identifier `public_id: 2354`. Both `/songs/94316/` and `/songs/2354/` returned the same object in this test. Use the returned `id` as the provider record identifier; preserve `public_id` separately. Do not rely on names, filenames, or `original_key` as unique IDs. The behavior when public and internal IDs collide was not tested.

Recommended unified identity is provider-qualified, for example `juiceapi:94316`, with the raw integer retained for this API. That prevents collisions with Vault IDs. Long-term ID stability across backend data reloads is not established.

Selected **actual** fields from the playable record (long lyrics and prose metadata omitted):

```json
{
  "id": 94316,
  "public_id": 2354,
  "name": "2MININHELL",
  "original_key": "2MININHELL",
  "category": "unreleased",
  "era": {
    "id": 101,
    "name": "jute",
    "description": "JUICED UP THE EP",
    "time_frame": "January 2014 - January 30th 2016",
    "play_count": 34107
  },
  "path": "Compilation/2. Unreleased Discography/1. JUICED UP THE EP (Sessions)/2MININHELL.mp3",
  "track_titles": ["2MININHELL", "2MININHELL (Pt. 1)", "2 Minutes In Hell (Pt. 1)"],
  "credited_artists": "JuiceTheKidd",
  "producers": "J Knight",
  "engineers": "Pedro Ramirez",
  "length": "3:42",
  "bpm": "",
  "key": "",
  "file_names": "2MININHELL",
  "album": "",
  "snippets": [],
  "image_url": "/assets/jute.png"
}
```

Additional returned fields include `recording_locations`, `record_dates`, `bitrate`, `additional_information`, `instrumentals`, `preview_date`, `release_date`, `dates`, `session_titles`, `session_tracking`, `instrumental_names`, `groupbuy_info`, `lyrics`, `synced_lyrics`, `date_leaked`, and `leak_type`. Many are empty strings or freeform prose rather than typed dates/numbers. `groupbuy_info` is nested; `track_titles` and `snippets` are arrays. The exact complete object is saved in `detail-internal-id.json`.

## 3. Audio streaming and the wrapper

Given a nonempty `track.path`, construct:

```text
https://juicewrldapi.com/juicewrld/files/download/?path={URL-encoded track.path}
```

Use `URLSearchParams` to encode the complete relative path. Spaces, parentheses, ampersands, and slash encoding must not corrupt the query. The sampled URL contains only `path`; it is not an expiring signed URL. No token, cookie, referer, or wrapper-specific User-Agent was required for this test.

The current site's `getAudioStreamUrl` does exactly this using `URLSearchParams`. Its player also uses native `new Audio` for media preloading. Direct HTML5 audio is sufficient for the new client's basic streaming/seek path; no Python wrapper, custom decoder, ffmpeg process, or whole-file Blob fetch is needed. Browser playback itself was not exercised in this pass.

### Single live range test

Captured `2026-10-13T23:26:22.818Z`. Request headers contained only the explicit `Range` and test `Origin` below; Node's HTTP implementation may add transport defaults. No cookie jar or auth credentials were supplied.

```http
GET https://juicewrldapi.com/juicewrld/files/download/?path=Compilation%2F2.+Unreleased+Discography%2F1.+JUICED+UP+THE+EP+%28Sessions%29%2F2MININHELL.mp3
Range: bytes=0-63
Origin: http://localhost:5173
```

Response: **206 Partial Content**, no redirect; 64 bytes delivered. Important captured headers:

```http
accept-ranges: bytes, bytes
access-control-allow-headers: Range, If-Range, If-Modified-Since, If-None-Match, Authorization, Origin, Accept
access-control-allow-methods: GET, OPTIONS, HEAD
access-control-allow-origin: *
access-control-expose-headers: Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag, Last-Modified
cache-control: public, max-age=3600
content-disposition: inline; filename="2MININHELL.mp3"
content-length: 64
content-range: bytes 0-63/9956956
content-type: audio/mpeg
date: Tue, 13 Oct 2026 23:26:23 GMT
etag: "69968534-97ee5c"
last-modified: Thu, 19 Feb 2026 03:36:20 GMT
server: cloudflare
```

First 64 bytes, hexadecimal:

```text
49443303000000401c2654414c420000003b000001fffe4a00550049004300450044002000550050002000540048004500200045005000200028005300650073
```

ASCII projection: `ID3....@.&TALB...;.....J.U.I.C.E.D. .U.P. .T.H.E. .E.P. .(.S.e.s`. This is an ID3-tag prefix. Full normalized response headers, including Cloudflare tracing/reporting fields, request metadata, hexadecimal/Base64 bytes, and timing are preserved in `recon/juiceapi/audio-range.json`. Header spelling/casing reflects Node's normalized Headers view, not a wire packet capture.

The response demonstrates byte-range delivery needed for scrubbing for this file. `Content-Length: 64` is the partial response size; total file size is 9,956,956 bytes from `Content-Range`, also confirmed by `/files/info/`. It does not prove every file's seek behavior, end-of-file ranges, multi-range delivery, or an actual Electron origin's browser behavior.

### Older wrapper versus current API

`stream_audio_file(file_path)` requests the same `/juicewrld/files/download/?path=...` URL, percent-encodes the supplied path, and sends `Range: bytes=0-0`. It returns URL/content type/range support metadata after a 200 or 206 response. Its reported `content_length` can be the one-byte range length rather than the total file size.

`play_juicewrld_song(song_id)` is less reliable: it depends on the older `/player/songs/{id}/` record, examines a `file` field, and otherwise guesses filenames/folders from title and album. It can return an unverified URL even when its probes fail. The wrapper's `/player/songs/` list returned 404 here. Avoid that convenience method; use current `/songs/` records and their `path`.

There is also a working independent file lookup:

```text
/juicewrld/files/browse/?path=Compilation&search=2MININHELL
```

It returned two MP3s with fields `name`, `path`, `type`, `size`, `size_human`, `modified`, `extension`, `mime_type`, and `duration`. The envelope includes `current_path`, `path_parts`, `items`, `total_items`, `total_files`, `total_directories`, `search_query`, `is_recursive_search`, `page`, `page_size`, `page_count`, `has_more`, and `cached`.

The website contains an exact/alias/fuzzy filename fallback when metadata has no path. This is a heuristic, not a stable track-to-file relationship. Empty paths should normally be represented as unavailable. If file-browser fallback is later desired, require a reliable match rather than silently assigning a similarly named recording. File-browser pagination parameters beyond this small search were not tested.

## 4. Working copy-paste examples

These are public read-only commands. Use `curl.exe` on Windows to avoid PowerShell's historical `curl` alias. The same routes were live-tested; Node example modes below were also executed and saved their responses.

### 1. List Unreleased tracks

```powershell
curl.exe -G "https://juicewrldapi.com/juicewrld/songs/" --data-urlencode "category=unreleased" --data-urlencode "page=1" --data-urlencode "page_size=2"
```

Expected envelope: `count`, `next`, `previous`, `results`. Capture-time count: 1,500.

### 2. Search by name

```powershell
curl.exe -G "https://juicewrldapi.com/juicewrld/songs/" --data-urlencode "search=2MININHELL" --data-urlencode "page=1" --data-urlencode "page_size=2"
```

Capture-time result: two matching records, including IDs 94316 and 94343. Add `category` or `era` when restricting the search to a selected facet.

### 3. Resolve the playable URL for track 94316

Copy this JavaScript into a `.cjs` file and run with Node 18+:

```javascript
(async () => {
  const response = await fetch('https://juicewrldapi.com/juicewrld/songs/94316/');
  if (!response.ok) throw new Error(`Track request failed: ${response.status}`);
  const track = await response.json();
  if (typeof track.path !== 'string' || !track.path.trim()) {
    throw new Error('This track has no playable audio path');
  }
  const url = new URL('https://juicewrldapi.com/juicewrld/files/download/');
  url.searchParams.set('path', track.path);
  console.log(url.href);
})().catch(error => { console.error(error); process.exitCode = 1; });
```

Already-saved executable equivalent, from this workspace:

```powershell
node recon/juiceapi/examples.cjs audio
```

The script also accepts `category` and `search`. Resolving the URL does not download or play audio. The actual sampled output URL is the one in the range request above.

## 5. Mapping to Vault and adapter implications

| Vault/unified field | JuiceWRLDAPI source | Conversion and caveat |
|---|---|---|
| Track identifier | `id`; optional `public_id` | Qualify with provider; retain both original identifiers |
| `title` | `name` | Preserve `track_titles` as aliases; `original_key` is extra metadata |
| `author` | `credited_artists` | Freeform string; do not split on commas without a defined credit format |
| `song_path` | `path` | Provider-specific relative file path; resolve through API `/files/download/`, never through Vault media host |
| `image_path` / artwork URL | `image_url` | Resolve relative `/assets/...` against `https://juicewrldapi.com`; preserve absolute URLs when present |
| `duration_seconds` | `length` | `3:42` maps to 222 seconds; parse valid time text, otherwise use null/unknown. Use media metadata for actual playback duration |
| `source_category` | `category` | Preserve raw value; `recording_session` corresponds to a Studio Sessions display category |
| `era` | `era.name` | Preserve full era object separately; filter API using name, not numeric ID |
| `source_metadata` | Original record and provider context | Keep provenance, original IDs, path, and detailed credits rather than flattening away useful fields |
| Playable availability | Nonempty `path` | Empty path is not a playable URL; sampled `snippets` arrays were empty, so no snippet schema is inferred |

Vault's own shelf classification sometimes depends on source metadata and differs from `source_category` (for example Stems). Do not infer that JuiceAPI supports Vault's Stems, Remasters, or Miscellaneous shelves. On server swap, replace the entire category set and era facets, clear provider-specific pagination/search state, and stop or explicitly retain the old provider's playback according to the eventual product decision. Local likes/playlists must carry provider-qualified track IDs.

For the currently proposed adapter:

- `listCategories()` can read `/categories/`; fetch all `/eras/` pages separately if presenting an era filter.
- `fetchCategory` and `search` must convert offset-based requests into page-based reads. Preserve the API's total metadata count; filtered playable rows may be fewer than that total.
- `resolveAudioUrl(track)` can remain synchronous for records with `path`, but unavailable records need an explicit unavailable state or error. A future filename-search fallback would require asynchronous resolution and a matching policy.
- Downloads can use the same file endpoint, without a Range header for a full file. Full download behavior was not tested; avoid eagerly fetching a complete Blob merely to start playback.

### Plain-language conclusion

**(a) Straightforward or fragile?** Direct streaming is straightforward for a track with a known path: anonymous URL, MP3 content, working byte ranges, and permissive CORS in the sample. The fragile parts are incomplete catalogue-to-file links, older wrapper methods, backend ID stability, and metadata quality. Use the current documented REST surface directly.

**(b) Minimal client?** A JavaScript `fetch` client for `/songs/`, `/categories/`, and `/eras/`; a path-to-URL resolver; and an HTML5 audio element for playback and seeking. A separate server adapter keeps these routes, pagination, availability, and metadata conversions out of the shared UI. No Python process or new backend is needed for the observed public flow.

**(c) Track shape?** Rich metadata object with an integer ID, nullable public ID, name, category, nested era, audio path, artwork URL, aliases, freeform credits/dates, duration text, lyrics, and optional snippet/groupbuy information. Its core fields map cleanly to Vault's title/author/path/artwork/category/era fields; duration needs parsing and absent audio needs a first-class unavailable state.

## Evidence and reproduction

- `probe-surface.cjs`: site, pinned wrapper source/docs, overview/categories/eras, initial songs and stale player route.
- `probe-catalogue.cjs`: category/detail/search/era/pagination/file-info probes and SPA entry/config.
- `probe-frontend.cjs`: current API docs/player/file-browser bundles, second era page, and file search.
- `probe-audio.cjs`: the single `bytes=0-63` audio request; cancels after captured bytes rather than downloading the full track.
- `examples.cjs`: executable category/search/URL-resolution examples; saves corresponding JSON.
- `self-check.cjs`: offline assertions against the saved response contracts and sample range result. Run `node recon/juiceapi/self-check.cjs`.
- Each `.json` capture includes request URL, status, final URL, headers, timestamp, and response body or error. Source/HTML captures use a string `body`; API captures use parsed JSON. These are faithful body/header captures, not packet traces. Original Python/JavaScript sources are also saved alongside their JSON envelopes. Captures may include long lyrics; they are not reproduced in this report.

Not checked: full-track playback/download, actual Electron browser CORS/seek behavior, every catalogue record/file format, missing-path matching success rate, write/auth flows, rate limits, or ID collisions/stability. One public MP3 succeeding does not establish universal availability. No application, themes, or UI changes were made.
