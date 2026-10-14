import type { Category, Era, FetchCategoryOptions, Page, ServerAdapter } from '../types/adapter';
import type { Track } from '../types/track';
import { sanitizeFilename } from '../lib/sanitizeFilename';

const base = 'https://juicewrldapi.com/juicewrld/';
let categories: Category[] | undefined;
let eras: Era[] | undefined;

interface Song {
  id: number | string;
  name?: string | null;
  credited_artists?: string | null;
  path?: string | null;
  image_url?: string | null;
  length?: string | null;
  category?: string | null;
  era?: { name?: string | null } | null;
}

async function request(url: URL) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`JuiceAPI HTTP ${response.status}: ${url}`);
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`JuiceAPI invalid JSON (${url}): ${body.slice(0, 200)}`);
  }
}

async function requestPage(url: URL) {
  const body = await request(url);
  if (!body || !Array.isArray(body.results) || !Number.isSafeInteger(body.count) || body.count < 0
    || !(body.next === null || typeof body.next === 'string')) {
    throw new Error(`JuiceAPI invalid page: ${url}`);
  }
  return body as { results: unknown[]; count: number; next: string | null };
}

function parseLength(value: string | null | undefined): number | null {
  if (!value || !/^\d+:[0-5]\d(?::[0-5]\d)?$/.test(value)) return null;
  const seconds = value.split(':').reduce((total, part) => total * 60 + Number(part), 0);
  return Number.isFinite(seconds) ? seconds : null;
}

function buildAudioUrl(path: string): string {
  const url = new URL(`${base}files/download/`);
  url.searchParams.set('path', path);
  return url.href;
}

function mapTrack(record: unknown, category: string): Track {
  if (!record || typeof record !== 'object') throw new Error('JuiceAPI invalid song record');
  const raw = record as Song;
  if ((typeof raw.id !== 'string' && typeof raw.id !== 'number')
    || ['name', 'credited_artists', 'path', 'image_url', 'length', 'category'].some(key => {
      const value = (record as Record<string, unknown>)[key];
      return value != null && typeof value !== 'string';
    }) || (raw.era != null && (typeof raw.era !== 'object'
      || (raw.era.name != null && typeof raw.era.name !== 'string')))) {
    throw new Error('JuiceAPI invalid song fields');
  }
  return {
    serverId: 'juiceapi',
    providerTrackId: String(raw.id),
    trackId: `juiceapi:${String(raw.id)}`,
    title: raw.name || '(untitled)',
    author: raw.credited_artists || '',
    durationSeconds: parseLength(raw.length) ?? null,
    imageUrl: raw.image_url ? new URL(raw.image_url, 'https://juicewrldapi.com').href : null,
    audioUrl: raw.path && raw.path.trim() ? buildAudioUrl(raw.path) : null,
    category: raw.category || category,
    era: raw.era?.name ?? undefined,
    raw,
  };
}

async function fetchTracks(category: string, offset: number, limit: number,
  opts?: FetchCategoryOptions): Promise<Page<Track>> {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error('JuiceAPI requires a nonnegative integer offset and positive integer limit');
  }
  const url = new URL(`${base}songs/`);
  if (category) url.searchParams.set('category', category);
  if (opts?.era) url.searchParams.set('era', opts.era);
  if (opts?.search) url.searchParams.set('search', opts.search);
  const page = Math.floor(offset / limit) + 1;
  const sliceStart = offset % limit;
  url.searchParams.set('page', String(page));
  url.searchParams.set('page_size', String(limit));
  let body = await requestPage(url);
  const total = body.count;
  const records = body.results.slice(sliceStart);
  if (records.length < limit && body.next !== null) {
    url.searchParams.set('page', String(page + 1));
    body = await requestPage(url);
    records.push(...body.results);
  }
  const items = records.slice(0, limit).map(raw => mapTrack(raw, category));
  return { items, total, hasMore: offset + items.length < total || body.next !== null };
}

export const juiceapiAdapter: ServerAdapter = {
  id: 'juiceapi',
  displayName: 'JuiceWRLD API',
  async listCategories() {
    if (categories) return categories;
    const url = new URL(`${base}categories/`);
    const body = await request(url);
    if (!body || !Array.isArray(body.categories) || body.categories.some((entry: unknown) => {
      if (!entry || typeof entry !== 'object') return true;
      const item = entry as Category;
      return typeof item.value !== 'string' || typeof item.label !== 'string';
    })) throw new Error(`JuiceAPI invalid categories response: ${url}`);
    categories = body.categories.filter((item: Category) => item.value !== 'unsurfaced').map((item: Category) => ({
      value: item.value, label: item.value === 'recording_session' ? 'Studio Sessions' : item.label,
    }));
    return categories!;
  },
  async listEras() {
    if (eras) return eras;
    const items: Era[] = [];
    const url = new URL(`${base}eras/`);
    let page = 1;
    while (true) {
      url.searchParams.set('page', String(page));
      const body = await requestPage(url);
      for (const record of body.results) {
        if (!record || typeof record !== 'object' || typeof (record as { name?: unknown }).name !== 'string') {
          throw new Error(`JuiceAPI invalid era: ${url}`);
        }
        const name = (record as { name: string }).name;
        items.push({ value: name, label: name });
      }
      if (body.next === null) break;
      if (body.results.length === 0) throw new Error(`JuiceAPI empty era page with next: ${url}`);
      page++;
    }
    eras = items;
    return eras;
  },
  fetchCategory(category, offset, limit, opts) {
    if (category === 'unsurfaced') return Promise.resolve({ items: [], total: 0, hasMore: false });
    return fetchTracks(category, offset, limit, opts);
  },
  async fetchTrackById(providerTrackId) {
    if (!/^\d+$/.test(providerTrackId)) return null;
    try {
      const body = await request(new URL(`${base}songs/${providerTrackId}/`));
      if (!body) return null;
      const track = mapTrack(body, '');
      return track.providerTrackId === providerTrackId ? track : null;
    } catch { return null; }
  },
  search(query, offset, limit) {
    return fetchTracks('', offset, limit, { search: query });
  },
  async getShufflePool(opts) {
    const limit = opts?.limit ?? 200;
    if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('JuiceAPI shuffle limit must be a nonnegative integer');
    if (limit === 0) return [];
    const url = new URL(`${base}songs/`);
    if (opts?.category) url.searchParams.set('category', opts.category);
    url.searchParams.set('page', '1');
    url.searchParams.set('page_size', String(Math.min(limit, 200)));
    const body = await requestPage(url);
    return body.results.slice(0, limit).map(record => {
      const id = record && typeof record === 'object' ? (record as { id?: unknown }).id : undefined;
      if (typeof id !== 'string' && typeof id !== 'number') throw new Error(`JuiceAPI invalid shuffle ID: ${url}`);
      return String(id);
    });
  },
  resolveAudioUrl(track) {
    return track.audioUrl;
  },
  async downloadTrack(track, subfolder, destination) {
    if (!track.audioUrl) throw new Error('Track has no audio');
    const response = await fetch(track.audioUrl);
    if (!response.ok) throw new Error(`JuiceAPI download HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    await window.api.saveBlob(bytes, sanitizeFilename(`${track.title}.mp3`), subfolder, destination);
  },
};

export default juiceapiAdapter;
