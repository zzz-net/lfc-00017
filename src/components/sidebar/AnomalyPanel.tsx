import { AlertTriangle, Download, FileWarning, Crosshair } from 'lucide-react';
import { useWarehouseStore } from '@/store/warehouseStore';

export default function AnomalyPanel() {
  const anomalies = useWarehouseStore((s) => s.anomalies);
  const exportAnomalies = useWarehouseStore((s) => s.exportAnomalies);

  const unknowns = anomalies.filter((a) => a.type === 'unknown_location');
  const conflicts = anomalies.filter((a) => a.type === 'coordinate_conflict');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">异常检测</h3>
        {anomalies.length > 0 && (
          <button
            onClick={exportAnomalies}
            className="flex items-center gap-1 text-[10px] text-[#00d4ff] hover:text-[#00d4ff]/80 transition-colors"
          >
            <Download size={10} />
            导出
          </button>
        )}
      </div>

      {anomalies.length === 0 && (
        <div className="flex items-center gap-2 px-3 py-3 bg-green-900/20 border border-green-700/30 rounded-lg">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-green-400">无异常</span>
        </div>
      )}

      {conflicts.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-amber-400">
            <Crosshair size={12} />
            <span className="font-medium">坐标冲突 ({conflicts.length})</span>
          </div>
          {conflicts.map((a, i) => (
            <div
              key={`conflict-${i}`}
              className="px-2.5 py-2 bg-amber-900/15 border border-amber-700/30 rounded text-xs space-y-1"
            >
              <div className="flex items-center gap-1.5">
                <FileWarning size={10} className="text-amber-400 shrink-0" />
                <span className="text-amber-300">行 {a.row}</span>
              </div>
              <p className="text-gray-400 text-[10px] leading-relaxed pl-4">{a.message}</p>
              <div className="flex flex-wrap gap-1 pl-4">
                {a.locationIds.map((id) => (
                  <span
                    key={id}
                    className="px-1.5 py-0.5 bg-amber-900/30 text-amber-300 rounded font-mono text-[10px]"
                  >
                    {id}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {unknowns.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-red-400">
            <AlertTriangle size={12} />
            <span className="font-medium">未知货位 ({unknowns.length})</span>
          </div>
          {unknowns.map((a, i) => (
            <div
              key={`unknown-${i}`}
              className="px-2.5 py-2 bg-red-900/15 border border-red-700/30 rounded text-xs space-y-1"
            >
              <p className="text-gray-400 text-[10px] leading-relaxed">{a.message}</p>
              <div className="flex flex-wrap gap-1">
                {a.locationIds.map((id) => (
                  <span
                    key={id}
                    className="px-1.5 py-0.5 bg-red-900/30 text-red-300 rounded font-mono text-[10px]"
                  >
                    {id}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
