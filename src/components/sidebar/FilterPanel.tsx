import { Calendar, MapPin } from 'lucide-react';
import { useWarehouseStore } from '@/store/warehouseStore';

export default function FilterPanel() {
  const filter = useWarehouseStore((s) => s.filter);
  const setFilter = useWarehouseStore((s) => s.setFilter);
  const getAvailableZones = useWarehouseStore((s) => s.getAvailableZones);
  const zones = getAvailableZones();

  const handleDateChange = (field: 'start' | 'end', value: string) => {
    const current = filter.dateRange || { start: '', end: '' };
    const newRange = { ...current, [field]: value };
    if (newRange.start && newRange.end) {
      setFilter({ dateRange: newRange });
    } else if (!newRange.start && !newRange.end) {
      setFilter({ dateRange: null });
    } else {
      setFilter({ dateRange: newRange });
    }
  };

  const toggleZone = (zone: string) => {
    const current = filter.zones;
    const allZones = getAvailableZones();
    
    if (current.length === 0) {
      setFilter({ zones: allZones.filter((z) => z !== zone) });
    } else if (current.includes(zone)) {
      const newZones = current.filter((z) => z !== zone);
      setFilter({ zones: newZones.length === allZones.length ? [] : newZones });
    } else {
      setFilter({ zones: [...current, zone] });
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">筛选条件</h3>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <Calendar size={12} />
          <span>日期范围</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <input
            type="date"
            value={filter.dateRange?.start || ''}
            onChange={(e) => handleDateChange('start', e.target.value)}
            className="bg-[#0f1419] border border-[#2a3a4e] rounded px-2 py-1.5 text-xs text-gray-300 focus:border-[#00d4ff]/50 focus:outline-none transition-colors"
          />
          <input
            type="date"
            value={filter.dateRange?.end || ''}
            onChange={(e) => handleDateChange('end', e.target.value)}
            className="bg-[#0f1419] border border-[#2a3a4e] rounded px-2 py-1.5 text-xs text-gray-300 focus:border-[#00d4ff]/50 focus:outline-none transition-colors"
          />
        </div>
        {filter.dateRange && (
          <button
            onClick={() => setFilter({ dateRange: null })}
            className="text-[10px] text-[#00d4ff] hover:underline"
          >
            清除日期
          </button>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <MapPin size={12} />
          <span>区域选择</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {zones.map((zone) => {
            const active = filter.zones.length === 0 || filter.zones.includes(zone);
            return (
              <button
                key={zone}
                onClick={() => toggleZone(zone)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                  active
                    ? 'bg-[#00d4ff]/20 text-[#00d4ff] border border-[#00d4ff]/40'
                    : 'bg-[#1a2332] text-gray-400 border border-[#2a3a4e] hover:border-[#00d4ff]/30'
                }`}
              >
                {zone}
              </button>
            );
          })}
          {filter.zones.length > 0 && (
            <button
              onClick={() => setFilter({ zones: [] })}
              className="text-[10px] text-[#00d4ff] hover:underline px-2.5 py-1"
            >
              全部
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
