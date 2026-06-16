import { useEffect } from 'react';
import PlaybackSidebar from '@/components/PlaybackSidebar';
import Scene3D from '@/components/Scene3D';
import TopNav from '@/components/TopNav';
import { useWarehouseStore } from '@/store/warehouseStore';

export default function Playback() {
  const restoreLatestOnStartup = useWarehouseStore((s) => s.restoreLatestOnStartup);

  useEffect(() => {
    document.title = '验收回放台 - 仓储 3D 热力图';
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      restoreLatestOnStartup();
    }, 100);
    return () => clearTimeout(timer);
  }, [restoreLatestOnStartup]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0a0f1a] flex-col">
      <TopNav />
      <div className="flex flex-1 min-h-0 pt-11">
        <PlaybackSidebar />
        <div className="flex-1 relative">
          <Scene3D />
        </div>
      </div>
    </div>
  );
}
