import { ChevronLeft, ChevronRight, Camera } from 'lucide-react';
import DemoPresets from './sidebar/DemoPresets';
import DataImporter from './sidebar/DataImporter';
import FilterPanel from './sidebar/FilterPanel';
import ThresholdPanel from './sidebar/ThresholdPanel';
import BookmarkPanel from './sidebar/BookmarkPanel';
import AnomalyPanel from './sidebar/AnomalyPanel';
import PlaybackLog from './sidebar/PlaybackLog';
import SnapshotArchive from './sidebar/SnapshotArchive';
import ReplenishmentSandbox from './sidebar/ReplenishmentSandbox';
import { useWarehouseStore } from '@/store/warehouseStore';

export default function PlaybackSidebar() {
  const collapsed = useWarehouseStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useWarehouseStore((s) => s.setSidebarCollapsed);
  const locations = useWarehouseStore((s) => s.locations);
  const pickRecords = useWarehouseStore((s) => s.pickRecords);
  const importConflicts = useWarehouseStore((s) => s.importConflicts);
  const activePresetId = useWarehouseStore((s) => s.playback.activePresetId);
  const lastSnapshotFileName = useWarehouseStore((s) => s.playback.lastSnapshotFileName);
  const exportSnapshot = useWarehouseStore((s) => s.exportSnapshot);
  const totalRejected = importConflicts.reduce((s, c) => s + c.rejectedIds.length, 0);

  return (
    <div
      className={`flex h-full transition-all duration-300 ${
        collapsed ? 'w-10' : 'w-80'
      }`}
    >
      <div className="flex flex-col h-full">
        <button
          onClick={() => setSidebarCollapsed(!collapsed)}
          className="flex items-center justify-center w-10 h-10 bg-[#1a2332] hover:bg-[#1e2d42] border-b border-[#2a3a4e] transition-colors shrink-0"
        >
          {collapsed ? (
            <ChevronRight size={16} className="text-gray-400" />
          ) : (
            <ChevronLeft size={16} className="text-gray-400" />
          )}
        </button>

        {!collapsed && (
          <div className="flex-1 overflow-y-auto p-3 space-y-4 bg-[#0f1419]">
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-[#00d4ff] flex items-center gap-1.5">
                验收回放台
              </h2>
              <p className="text-[10px] text-gray-500 leading-relaxed">
                一键装载演示样例，快速复现热力图、异常、书签、筛选等验收场景，
                支持跨重启恢复和导入导出冲突处理。
              </p>
            </div>

            <DemoPresets />

            <div className="h-px bg-[#2a3a4e]" />

            <DataImporter />

            {locations.length > 0 && (
              <>
                <div className="h-px bg-[#2a3a4e]" />
                <FilterPanel />
              </>
            )}

            {locations.length > 0 && (
              <>
                <div className="h-px bg-[#2a3a4e]" />
                <ThresholdPanel />
              </>
            )}

            {locations.length > 0 && (
              <>
                <div className="h-px bg-[#2a3a4e]" />
                <BookmarkPanel />
              </>
            )}

            <div className="h-px bg-[#2a3a4e]" />
            <AnomalyPanel />

            <div className="h-px bg-[#2a3a4e]" />
            <PlaybackLog />

            <div className="h-px bg-[#2a3a4e]" />
            <SnapshotArchive />

            <div className="h-px bg-[#2a3a4e]" />
            <ReplenishmentSandbox />

            {locations.length > 0 && (
              <>
                <div className="h-px bg-[#2a3a4e]" />
                <div className="space-y-2">
                  <button
                    onClick={exportSnapshot}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#00d4ff]/10 hover:bg-[#00d4ff]/20 border border-[#00d4ff]/30 hover:border-[#00d4ff]/50 rounded-lg text-sm text-[#00d4ff] transition-all"
                  >
                    <Camera size={14} />
                    导出演示快照
                  </button>
                  <div className="text-[10px] text-gray-600 space-y-0.5">
                    <p>有效货位: {locations.length} | 拣货记录: {pickRecords.length}</p>
                    {totalRejected > 0 && (
                      <p className="text-red-400">已拒绝冲突货位: {totalRejected}</p>
                    )}
                    <p>区域: {[...new Set(locations.map((l) => l.zone))].join(', ') || '-'}</p>
                    {activePresetId && (
                      <p className="text-[#00d4ff]">当前样例: {activePresetId}</p>
                    )}
                    {lastSnapshotFileName && (
                      <p className="text-gray-500 truncate" title={lastSnapshotFileName}>
                        最近快照: {lastSnapshotFileName}
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
