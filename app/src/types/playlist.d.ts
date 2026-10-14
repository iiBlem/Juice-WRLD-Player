export interface Playlist {
  /** Stable identity; the reserved playlist uses "liked-songs". */
  id: string;
  name: string;
  /** The single Liked Songs playlist cannot be deleted or renamed. */
  reserved: boolean;
  /** Ordered, provider-scoped Track.trackId values. */
  trackIds: string[];
  /** Creation timestamp in epoch milliseconds. */
  createdAt: number;
  coverUrl?: string;
}
