import { useCallback, useEffect, useState } from 'react';
import ConfirmPopover from './ConfirmPopover';
import { usePlayerStore } from '../state/player';
import './CategoryTabs.css';

export default function CategoryTabs() {
  const [confirming, setConfirming] = useState(false);
  const cancel = useCallback(() => setConfirming(false), []);
  const active = usePlayerStore(state => state.bulkDownload?.active ?? false);
  const serverId = usePlayerStore(state => state.serverId);
  const categories = usePlayerStore(state => state.categories);
  const selected = usePlayerStore(state => state.selectedCategory);
  const loading = usePlayerStore(state => state.isLoadingTracks);
  useEffect(() => { setConfirming(false); }, [selected, serverId, active]);
  return <div className="category-bar">
    <nav className="category-tabs glass-panel" aria-label="Music categories">
    {!categories.length && loading
      ? Array.from({ length: 4 }, (_, i) => <span className="category-skeleton shimmer" key={i} />)
      : categories.map(category => <button key={category.value} type="button"
        aria-pressed={selected === category.value} className={selected === category.value ? 'active' : ''}
        onClick={() => void usePlayerStore.getState().selectCategory(category.value)}>{category.label}</button>)}
    </nav>
    <div className="download-anchor category-download">
      <button type="button" className="download-button" disabled={active || selected === null}
        title={active ? 'Download in progress' : 'Download this category'} aria-label="Download this category"
        aria-haspopup="dialog" aria-expanded={confirming} onClick={() => setConfirming(!confirming)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6" /></svg>
      </button>
      {confirming && <ConfirmPopover message="Download all tracks in this category?" confirmLabel="Download"
        onCancel={cancel} onConfirm={() => { cancel(); void usePlayerStore.getState().startBulkDownload('category'); }} />}
    </div>
  </div>;
}
