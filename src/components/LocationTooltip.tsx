import { useMemo } from 'react';
import { useWarehouseStore } from '@/store/warehouseStore';

export default function LocationTooltip({ locationId }: { locationId: string }) {
  const locations = useWarehouseStore((s) => s.locations);
  const filter = useWarehouseStore((s) => s.filter);
  const thresholds = useWarehouseStore((s) => s.thresholds);

  const loc = locations.find((l) => l.id === locationId);
  if (!loc) return null;

  const heatMap = useMemo(
    () => useWarehouseStore.getState().getHeatMap(),
    [locations, filter, thresholds]
  );
  const heat = heatMap.get(locationId);
  const count = heat?.count ?? 0;

  return (
    <div className="absolute bottom-4 right-4 bg-[#1a2332]/95 border border-[#00d4ff]/30 rounded-lg px-4 py-3 backdrop-blur-sm min-w-[200px] pointer-events-none z-50">
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: heat?.color || '#374151' }}
        />
        <span className="text-[#00d4ff] font-mono text-sm font-semibold">{locationId}</span>
      </div>
      <div className="space-y-1 text-xs text-gray-300">
        <p>区域: <span className="text-white">{loc.zone}</span></p>
        <p>坐标: <span className="text-white">行{loc.row} 列{loc.col} 层{loc.layer}</span></p>
        <p>拣货次数: <span className="text-white font-semibold">{count}</span></p>
        <p>世界坐标: <span className="text-white font-mono">({loc.x.toFixed(1)}, {loc.y.toFixed(1)}, {loc.z.toFixed(1)})</span></p>
      </div>
    </div>
  );
}
