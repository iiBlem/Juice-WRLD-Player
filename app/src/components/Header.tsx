import { useCallback, useEffect, useId, useRef, useState } from 'react';
import ConfirmPopover from './ConfirmPopover';
import WindowControls from './WindowControls';
import type { CSSProperties } from 'react';
import logo from '../assets/logo.png';
import { usePlayerStore } from '../state/player';
import './Header.css';

export default function Header() {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const cancel = useCallback(() => setConfirming(false), []);
  const active = usePlayerStore(state => state.bulkDownload?.active ?? false);
  const hasCategories = usePlayerStore(state => state.categories.length > 0);
  const serverId = usePlayerStore(state => state.serverId);
  const searchQuery = usePlayerStore(state => state.searchQuery);
  const theme = usePlayerStore(state => state.theme);
  const switcher = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const dropdownId = useId();
  useEffect(() => { setConfirming(false); }, [serverId, active]);

  useEffect(() => {
    if (!open) return;
    switcher.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !switcher.current?.contains(event.target)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return <header className="app-header glass-panel" style={{ WebkitAppRegion: 'drag' } as CSSProperties}>
    <button type="button" className="header-home" aria-label="Return to browse"
      onClick={() => usePlayerStore.getState().closePlaylist()}><img className="header-logo" src={logo} alt="" /></button>
    <button type="button" className="header-trigger" onClick={() => usePlayerStore.getState().closePlaylist()}>
      Juice WRLD Player
    </button>
    <div className="header-switcher" ref={switcher}>
      <button className="header-trigger" type="button" ref={trigger}
        aria-label="Choose music server" aria-expanded={open} aria-controls={dropdownId} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
      </button>
      {open && <div className="server-dropdown glass-panel" id={dropdownId} role="group" aria-label="Music server">
        {(['juiceapi', 'vault'] as const).map(id => <button type="button" key={id}
          aria-pressed={serverId === id} className={serverId === id ? 'active' : ''}
          onClick={() => {
            setOpen(false);
            trigger.current?.focus();
            void usePlayerStore.getState().switchServer(id).catch(error => console.error('Server switch failed:', error));
          }}>{id === 'vault' ? 'Juice WRLD Vault' : 'JuiceWRLD API'}</button>)}
      </div>}
    </div>
    <div className="header-search-slot">
      <div className="header-search" role="search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
        <input type="search" placeholder="Search songs" aria-label="Search songs" value={searchQuery}
          onChange={event => usePlayerStore.getState().setSearchQuery(event.target.value)}
          onKeyDown={event => { if (event.key === 'Escape') usePlayerStore.getState().setSearchQuery(''); }} />
        {searchQuery && <button type="button" aria-label="Clear search"
          onClick={() => usePlayerStore.getState().setSearchQuery('')}>×</button>}
      </div>
    </div>
    <div className="download-anchor">
      <button type="button" className="download-button" disabled={active || !hasCategories}
        title={active ? 'Download in progress' : 'Download all tracks from this server'}
        aria-label="Download all tracks from this server" aria-haspopup="dialog" aria-expanded={confirming}
        onClick={() => setConfirming(!confirming)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6" /></svg><small>All</small>
      </button>
      {confirming && <ConfirmPopover message="Download all tracks from this server?" confirmLabel="Download"
        onCancel={cancel} onConfirm={() => { cancel(); void usePlayerStore.getState().startBulkDownload('server'); }} />}
    </div>
    <button type="button" className="header-theme" aria-label={`Current theme: ${theme}. Switch to ${theme === 'red' ? 'charcoal' : 'red'}`}
      title={`Theme: ${theme}`} onClick={() => usePlayerStore.getState().setTheme(theme === 'red' ? 'charcoal' : 'red')}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" /></svg>
    </button>
    <WindowControls />
  </header>;
}
