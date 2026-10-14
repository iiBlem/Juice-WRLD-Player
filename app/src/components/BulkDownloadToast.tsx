import { usePlayerStore } from '../state/player';
import './BulkDownloadToast.css';

export default function BulkDownloadToast() {
  const job = usePlayerStore(state => state.bulkDownload);
  if (!job) return null;
  const progress = job.total ? job.completed / job.total * 100 : 0;
  return <aside className="bulk-download-toast glass-panel" aria-label="Bulk download">
    <h2 role="status">{job.active ? `Downloading ${job.scopeLabel}` : `Downloaded ${job.completed} of ${job.total}`}</h2>
    <div className="bulk-download-progress" role="progressbar" aria-label="Downloaded tracks"
      aria-valuemin={0} aria-valuemax={job.total || 1} aria-valuenow={job.completed}>
      <div style={{ width: `${progress}%` }} />
    </div>
    <p>{job.completed} / {job.total}{job.failed > 0 && <span className="bulk-download-error"> ({job.failed} failed)</span>}</p>
    <p className="bulk-download-track" title={job.currentTrackTitle}>
      {job.currentTrackTitle || (job.active && !job.total ? 'Reading catalog…' : '')}
    </p>
    {job.cancelled && <p role="status">{job.active ? 'Cancelling after the current operation…' : 'Cancelled'}</p>}
    {job.error && <p className="bulk-download-error" role="alert">{job.error}</p>}
    <button type="button" disabled={job.active && job.cancelled} onClick={() => {
      const state = usePlayerStore.getState();
      if (job.active) state.cancelBulkDownload();
      else state.clearBulkDownload();
    }}>{job.active ? 'Cancel' : 'Dismiss'}</button>
  </aside>;
}
