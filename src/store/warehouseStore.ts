import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Location,
  PickRecord,
  Anomaly,
  CameraBookmark,
  ThresholdConfig,
  FilterState,
} from '@/types/warehouse';
import { sampleLocations, samplePickRecords } from '@/data/sampleData';

function detectAnomalies(
  locations: Location[],
  pickRecords: PickRecord[]
): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const locationIds = new Set(locations.map((l) => l.id));

  const conflictMap = new Map<string, Location[]>();
  for (const loc of locations) {
    const key = `${loc.zone}:${loc.row}:${loc.col}:${loc.layer}`;
    if (!conflictMap.has(key)) conflictMap.set(key, []);
    conflictMap.get(key)!.push(loc);
  }

  const rowConflicts = new Map<number, string[]>();
  for (const [key, locs] of conflictMap) {
    if (locs.length > 1) {
      const row = locs[0].row;
      const ids = locs.map((l) => l.id);
      if (!rowConflicts.has(row)) rowConflicts.set(row, []);
      rowConflicts.get(row)!.push(...ids);
    }
  }

  for (const [row, ids] of rowConflicts) {
    const uniqueIds = [...new Set(ids)];
    anomalies.push({
      type: 'coordinate_conflict',
      row,
      locationIds: uniqueIds,
      message: `行 ${row} 坐标冲突: 存在 ${uniqueIds.length} 个坐标重叠的货位 (${uniqueIds.join(', ')})`,
    });
  }

  for (const rec of pickRecords) {
    if (!locationIds.has(rec.locationId)) {
      const existing = anomalies.find(
        (a) => a.type === 'unknown_location' && a.locationIds.includes(rec.locationId)
      );
      if (!existing) {
        anomalies.push({
          type: 'unknown_location',
          locationIds: [rec.locationId],
          message: `拣货记录引用未知货位: ${rec.locationId}`,
        });
      }
    }
  }

  return anomalies;
}

function getConflictingIds(locations: Location[]): Set<string> {
  const conflictMap = new Map<string, string[]>();
  for (const loc of locations) {
    const key = `${loc.zone}:${loc.row}:${loc.col}:${loc.layer}`;
    if (!conflictMap.has(key)) conflictMap.set(key, []);
    conflictMap.get(key)!.push(loc.id);
  }
  const ids = new Set<string>();
  for (const [, idList] of conflictMap) {
    if (idList.length > 1) {
      idList.forEach((id) => ids.add(id));
    }
  }
  return ids;
}

function computeHeatMap(
  locations: Location[],
  pickRecords: PickRecord[],
  filter: FilterState,
  thresholds: ThresholdConfig
): Map<string, { count: number; color: string; opacity: number }> {
  const result = new Map<string, { count: number; color: string; opacity: number }>();

  let filtered = pickRecords;
  if (filter.dateRange) {
    const start = new Date(filter.dateRange.start).getTime();
    const end = new Date(filter.dateRange.end).getTime();
    filtered = filtered.filter((r) => {
      const t = new Date(r.timestamp).getTime();
      return t >= start && t <= end;
    });
  }

  if (filter.zones.length > 0) {
    const zoneLocs = new Set(
      locations.filter((l) => filter.zones.includes(l.zone)).map((l) => l.id)
    );
    filtered = filtered.filter((r) => zoneLocs.has(r.locationId));
  }

  const countMap = new Map<string, number>();
  for (const rec of filtered) {
    countMap.set(rec.locationId, (countMap.get(rec.locationId) || 0) + rec.quantity);
  }

  const maxCount = Math.max(...countMap.values(), 1);

  for (const loc of locations) {
    if (filter.zones.length > 0 && !filter.zones.includes(loc.zone)) continue;
    const count = countMap.get(loc.id) || 0;
    if (count === 0) {
      result.set(loc.id, { count: 0, color: '#64748b', opacity: 0.6 });
    } else {
      const normalized = count / maxCount;
      let color: string;
      if (normalized <= thresholds.low / 100) color = '#3b82f6';
      else if (normalized <= thresholds.medium / 100) color = '#22c55e';
      else if (normalized <= thresholds.high / 100) color = '#eab308';
      else color = '#ef4444';
      result.set(loc.id, { count, color, opacity: 0.95 });
    }
  }

  return result;
}

interface WarehouseStore {
  locations: Location[];
  pickRecords: PickRecord[];
  anomalies: Anomaly[];
  filter: FilterState;
  thresholds: ThresholdConfig;
  cameraBookmarks: CameraBookmark[];
  activeBookmark: string | null;
  hoveredLocation: string | null;
  sidebarCollapsed: boolean;

  setLocations: (locs: Location[]) => void;
  setPickRecords: (records: PickRecord[]) => void;
  setFilter: (f: Partial<FilterState>) => void;
  setThresholds: (t: Partial<ThresholdConfig>) => void;
  addBookmark: (bm: CameraBookmark) => void;
  removeBookmark: (id: string) => void;
  setActiveBookmark: (id: string | null) => void;
  setHoveredLocation: (id: string | null) => void;
  setSidebarCollapsed: (v: boolean) => void;
  loadSampleData: () => void;
  exportAnomalies: () => void;
  getHeatMap: () => Map<string, { count: number; color: string; opacity: number }>;
  getConflictingIds: () => Set<string>;
  getAvailableZones: () => string[];
}

export const useWarehouseStore = create<WarehouseStore>()(
  persist(
    (set, get) => ({
      locations: [],
      pickRecords: [],
      anomalies: [],
      filter: { dateRange: null, zones: [] },
      thresholds: { low: 25, medium: 50, high: 75 },
      cameraBookmarks: [],
      activeBookmark: null,
      hoveredLocation: null,
      sidebarCollapsed: false,

      setLocations: (locs) => {
        const state = get();
        const anomalies = detectAnomalies(locs, state.pickRecords);
        set({ locations: locs, anomalies });
      },

      setPickRecords: (records) => {
        const state = get();
        const anomalies = detectAnomalies(state.locations, records);
        set({ pickRecords: records, anomalies });
      },

      setFilter: (f) =>
        set((state) => ({ filter: { ...state.filter, ...f } })),

      setThresholds: (t) =>
        set((state) => ({ thresholds: { ...state.thresholds, ...t } })),

      addBookmark: (bm) =>
        set((state) => ({
          cameraBookmarks: [...state.cameraBookmarks, bm],
        })),

      removeBookmark: (id) =>
        set((state) => ({
          cameraBookmarks: state.cameraBookmarks.filter((b) => b.id !== id),
          activeBookmark: state.activeBookmark === id ? null : state.activeBookmark,
        })),

      setActiveBookmark: (id) => set({ activeBookmark: id }),
      setHoveredLocation: (id) => set({ hoveredLocation: id }),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),

      loadSampleData: () => {
        const anomalies = detectAnomalies(sampleLocations, samplePickRecords);
        set({
          locations: sampleLocations,
          pickRecords: samplePickRecords,
          anomalies,
          filter: { dateRange: null, zones: [] },
        });
      },

      exportAnomalies: () => {
        const { anomalies } = get();
        const blob = new Blob([JSON.stringify({ anomalies }, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'anomalies.json';
        a.click();
        URL.revokeObjectURL(url);
      },

      getHeatMap: () => {
        const { locations, pickRecords, filter, thresholds } = get();
        return computeHeatMap(locations, pickRecords, filter, thresholds);
      },

      getConflictingIds: () => {
        const { locations } = get();
        return getConflictingIds(locations);
      },

      getAvailableZones: () => {
        const { locations } = get();
        return [...new Set(locations.map((l) => l.zone))].sort();
      },
    }),
    {
      name: 'warehouse-heatmap-store',
      partialize: (state) => ({
        locations: state.locations,
        pickRecords: state.pickRecords,
        anomalies: state.anomalies,
        filter: state.filter,
        thresholds: state.thresholds,
        cameraBookmarks: state.cameraBookmarks,
      }),
    }
  )
);
