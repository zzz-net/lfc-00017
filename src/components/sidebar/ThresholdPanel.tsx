import { Thermometer } from 'lucide-react';
import { useWarehouseStore } from '@/store/warehouseStore';

const THRESHOLD_LABELS = [
  { key: 'low' as const, label: '低', color: '#3b82f6' },
  { key: 'medium' as const, label: '中', color: '#22c55e' },
  { key: 'high' as const, label: '高', color: '#eab308' },
];

export default function ThresholdPanel() {
  const thresholds = useWarehouseStore((s) => s.thresholds);
  const setThresholds = useWarehouseStore((s) => s.setThresholds);

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">热力阈值</h3>

      <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
        <Thermometer size={12} />
        <span>颜色分档 (%)</span>
      </div>

      <div className="space-y-2.5">
        {THRESHOLD_LABELS.map(({ key, label, color }) => (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                <span className="text-xs text-gray-300">{label}</span>
              </div>
              <span className="text-xs font-mono text-gray-400">{thresholds[key]}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={thresholds[key]}
              onChange={(e) => setThresholds({ [key]: Number(e.target.value) })}
              className="w-full h-1.5 bg-[#1a2332] rounded-lg appearance-none cursor-pointer accent-[#00d4ff]"
            />
          </div>
        ))}
      </div>

      <div className="flex gap-1 pt-1">
        {['#3b82f6', '#22c55e', '#eab308', '#ef4444'].map((c, i) => (
          <div
            key={i}
            className="flex-1 h-2 rounded-sm"
            style={{ backgroundColor: c, opacity: 0.7 }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-gray-500">
        <span>冷</span>
        <span>热</span>
      </div>
    </div>
  );
}
