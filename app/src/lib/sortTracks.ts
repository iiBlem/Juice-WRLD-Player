import type { Track } from '../types/track';

export type SortMode = 'name-asc' | 'name-desc' | 'duration-asc' | 'duration-desc' | 'most-played';

export function sortTracks(tracks: Track[], mode: SortMode, mostPlayedSnapshot: Record<string, number>): Track[] {
  return [...tracks].sort((a, b) => {
    if (mode === 'name-asc') return a.title.localeCompare(b.title);
    if (mode === 'name-desc') return b.title.localeCompare(a.title);
    if (mode === 'most-played') {
      return (mostPlayedSnapshot[b.trackId] ?? 0) - (mostPlayedSnapshot[a.trackId] ?? 0)
        || a.title.localeCompare(b.title);
    }
    if (a.durationSeconds === null) return b.durationSeconds === null ? 0 : 1;
    if (b.durationSeconds === null) return -1;
    return mode === 'duration-asc' ? a.durationSeconds - b.durationSeconds : b.durationSeconds - a.durationSeconds;
  });
}
