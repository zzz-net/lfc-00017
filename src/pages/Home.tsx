import { useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Scene3D from '@/components/Scene3D';
import TopNav from '@/components/TopNav';
import { useWarehouseStore } from '@/store/warehouseStore';

export default function Home() {
  const restoreLatestOnStartup = useWarehouseStore((s) => s.restoreLatestOnStartup);
  const loadReplenishmentDraft = useWarehouseStore((s) => s.loadReplenishmentDraft);
  const loadCongestionDraft = useWarehouseStore((s) => s.loadCongestionDraft);

  useEffect(() => {
    document.title = '主页 - 仓储 3D 热力图';
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      restoreLatestOnStartup();
    }, 100);
    const draftTimer = setTimeout(() => {
      loadReplenishmentDraft();
    }, 200);
    const congestionDraftTimer = setTimeout(() => {
      loadCongestionDraft();
    }, 250);
    return () => {
      clearTimeout(timer);
      clearTimeout(draftTimer);
      clearTimeout(congestionDraftTimer);
    };
  }, [restoreLatestOnStartup, loadReplenishmentDraft, loadCongestionDraft]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0a0f1a] flex-col">
      <TopNav />
      <div className="flex flex-1 min-h-0 pt-11">
        <Sidebar />
        <div className="flex-1 relative">
          <Scene3D />
        </div>
      </div>
    </div>
  );
}
