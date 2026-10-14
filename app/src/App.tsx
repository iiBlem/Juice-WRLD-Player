import PlayerBar from './components/PlayerBar';
import BulkDownloadToast from './components/BulkDownloadToast';
import QueuePanel from './components/QueuePanel';
import Header from './components/Header';
import { useEffect } from 'react';
import CategoryTabs from './components/CategoryTabs';
import TrackList from './components/TrackList';
import Sidebar from './components/Sidebar';
import PlaylistView from './components/PlaylistView';
import { initSnapshotTimer, usePlayerStore } from './state/player';

export default function App() {
  const activeView = usePlayerStore(state => state.activeView);
  const isSearching = usePlayerStore(state => state.isSearching);
  useEffect(() => {
    void usePlayerStore.getState().loadCategories();
    return initSnapshotTimer();
  }, []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Header />
      <div style={{ display: 'flex', flex: 1, minHeight: 0, marginBottom: 90 }}>
        <Sidebar />
        <main style={{ flex: 1, overflowY: 'auto', overflowAnchor: 'none', minWidth: 0 }}>
          {activeView === 'browse' ? <>{!isSearching && <CategoryTabs />}<TrackList /></> : <PlaylistView />}
        </main>
      </div>
      <PlayerBar />
      <div className="right-stack">
        <QueuePanel />
        <BulkDownloadToast />
      </div>
    </div>
  );
}
