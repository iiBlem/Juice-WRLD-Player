import { useState } from 'react';
import { usePlayerStore } from '../state/player';
import { LIKED_SONGS_ID } from '../lib/playlistStorage';
import PlaylistActions from './PlaylistActions';
import './Sidebar.css';

export default function Sidebar() {
  const playlists = usePlayerStore(state => state.playlists);
  const loaded = usePlayerStore(state => state.playlistsLoaded);
  const activeId = usePlayerStore(state => state.activePlaylistId);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState('');
  const liked = playlists.find(playlist => playlist.id === LIKED_SONGS_ID);
  const ordered = [...(liked ? [liked] : []), ...playlists.filter(playlist => !playlist.reserved)
    .sort((a, b) => b.createdAt - a.createdAt)];
  return <aside className="collection-sidebar glass-panel" aria-label="Your Collection">
    <h2>Your Collection</h2>
    {!liked && <button className="collection-row" type="button" disabled>♡ <span>Liked Songs</span><small>0</small></button>}
    {ordered.map(playlist => <PlaylistActions key={playlist.id} playlist={playlist} onRename={() => {
      setRenaming(playlist.id); setName(playlist.name);
    }}>
      {renaming === playlist.id ? <form className="collection-rename" onSubmit={event => {
        event.preventDefault();
        if (name.trim()) { usePlayerStore.getState().renamePlaylist(playlist.id, name); setRenaming(null); }
      }} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setRenaming(null); } }}>
        <input autoFocus aria-label="Playlist name" value={name} onChange={event => setName(event.target.value)} />
        <button type="submit" disabled={!name.trim()}>Save</button>
      </form> : <button type="button" className={`collection-row${activeId === playlist.id ? ' active' : ''}`}
        aria-current={activeId === playlist.id ? 'page' : undefined}
        onClick={() => usePlayerStore.getState().openPlaylist(playlist.id)}>
        <span className={`collection-icon${playlist.reserved ? ' collection-heart' : ''}`} aria-hidden="true">{playlist.reserved ? '♥' : '♫'}</span>
        <span className="collection-name" title={playlist.name}>{playlist.name}</span><small>{playlist.trackIds.length}</small>
      </button>}
    </PlaylistActions>)}
    <button type="button" className="collection-row collection-new" disabled={!loaded} onClick={() => {
      const playlist = usePlayerStore.getState().createPlaylist('New Playlist');
      usePlayerStore.getState().openPlaylist(playlist.id);
    }}><span className="collection-icon" aria-hidden="true">+</span><span>New Playlist</span></button>
  </aside>;
}
