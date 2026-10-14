import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import './WindowControls.css';

export default function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    let disposed = false;
    let changed = false;
    const unsubscribe = window.api.onWindowMaximizedChanged(value => {
      changed = true;
      setMaximized(value);
    });
    void window.api.isWindowMaximized().then(value => {
      if (!disposed && !changed) setMaximized(value);
    }).catch(error => console.error('Window state query failed:', error));
    return () => { disposed = true; unsubscribe(); };
  }, []);
  return <div className="window-controls glass-panel" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
    <button type="button" aria-label="Minimize window" title="Minimize" onClick={() => window.api.windowMinimize()}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10" /></svg>
    </button>
    <button type="button" aria-label={maximized ? 'Restore window' : 'Maximize window'}
      title={maximized ? 'Restore' : 'Maximize'} onClick={() => window.api.windowMaximizeToggle()}>
      <svg viewBox="0 0 16 16" aria-hidden="true">{maximized
        ? <><path d="M5 5V2h9v9h-3" /><rect x="2" y="5" width="9" height="9" /></>
        : <rect x="3" y="3" width="10" height="10" />}</svg>
    </button>
    <button type="button" className="window-close" aria-label="Close window" title="Close" onClick={() => window.api.windowClose()}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 3 10 10M13 3 3 13" /></svg>
    </button>
  </div>;
}
