import { ChevronLeft, ChevronRight } from 'lucide-react';
import DataImporter from './sidebar/DataImporter';
import FilterPanel from './sidebar/FilterPanel';
import ThresholdPanel from './sidebar/ThresholdPanel';
import BookmarkPanel from './sidebar/BookmarkPanel';
import AnomalyPanel from './sidebar/AnomalyPanel';
import { useWarehouseStore } from '@/store/warehouseStore';

export default function Sidebar() {
  const collapsed = useWarehouseStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useWarehouseStore((s) => s.setSidebarCollapsed);
  const locations = useWarehouseStore((s) => s.locations);
  const pickRecords = useWarehouseStore((s) => s.pickRecords);

  return (
    <div
      className={`flex h-full transition-all duration-300 ${
        collapsed ? 'w-10' : 'w-72'
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
          <div className="flex-1 overflow-y-auto p-3 space-y-5 bg-[#0f1419]">
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

            {locations.length > 0 && (
              <>
                <div className="h-px bg-[#2a3a4e]" />
                <div className="text-[10px] text-gray-600 space-y-0.5">
                  <p>货位: {locations.length} | 拣货记录: {pickRecords.length}</p>
                  <p>区域: {[...new Set(locations.map((l) => l.zone))].join(', ')}</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
