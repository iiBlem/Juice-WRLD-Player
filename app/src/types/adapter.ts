import { Track, ServerId } from './track';

export interface Category {
  /** Value passed back to the adapter when fetching. */
  value: string;
  /** Human-readable label shown in the UI. */
  label: string;
}

export interface Era {
  /** Value passed back to the adapter as the era filter. For JuiceWRLDAPI
   *  this is the era NAME (e.g. "jute"), not the numeric id. */
  value: string;
  /** Human-readable label shown in the UI. */
  label: string;
}

export interface Page<T> {
  items: T[];
  /** Total record count reported by the provider, if available.
   *  This INCLUDES unplayable records (records with a null audioUrl). */
  total: number | null;
  /** True if the provider indicates more records exist beyond this page. */
  hasMore: boolean;
}

export interface FetchCategoryOptions {
  era?: string;
  search?: string;
}

export interface ShufflePoolOptions {
  /** Category to constrain the pool to. Omit for "all categories". */
  category?: string;
  /** Maximum number of IDs to return. Server may return fewer. */
  limit?: number;
}

export interface ServerAdapter {
  /** Stable id used in Track.serverId and in localStorage keys. */
  readonly id: ServerId;

  /** Human-readable name shown in the server switcher UI. */
  readonly displayName: string;

  /** List all categories this server exposes. */
  listCategories(): Promise<Category[]>;

  /** List all eras this server exposes. Optional — Vault does not implement. */
  listEras?(): Promise<Era[]>;

  /** Returns a pool of track IDs the player can shuffle through, optionally
   *  scoped to a category. If not implemented, the caller falls back to
   *  shuffling whatever is already loaded. */
  getShufflePool?(opts?: ShufflePoolOptions): Promise<string[]>;

  /** Fetch one page of a category using offset/limit semantics.
   *  Adapters that speak page/page_size internally must translate. */
  fetchCategory(
    category: string,
    offset: number,
    limit: number,
    opts?: FetchCategoryOptions,
  ): Promise<Page<Track>>;

  /** Search the catalog using offset/limit semantics. */
  search(query: string, offset: number, limit: number): Promise<Page<Track>>;

  /** Fetch one Track by its provider-scoped ID. Returns null if the
   * record no longer exists or is not accessible. */
  fetchTrackById(providerTrackId: string): Promise<Track | null>;

  /** Convert a Track into a playable URL, or null if unplayable.
   *  For most adapters this is a pure function of the Track, but the
   *  signature is sync for consistency and returns null on unavailable. */
  resolveAudioUrl(track: Track): string | null;

  /** Download a track's audio file. Each adapter saves the file itself
   *  and resolves when done. Throws on failure. */
  downloadTrack(track: Track, subfolder?: string, destination?: string): Promise<void>;
}
