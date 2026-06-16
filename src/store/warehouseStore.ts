import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Location,
  PickRecord,
  Anomaly,
  CameraBookmark,
  ThresholdConfig,
  FilterState,
  ImportConflict,
  CameraState,
  SnapshotData,
} from '@/types/warehouse';
import { sampleLocations, samplePickRecords } from '@/data/sampleData';

function filterConflictingLocations(
  locations: Location[]
): { valid: Location[]; conflicts: ImportConflict[] } {
  const coordMap = new Map<string, Location[]>();
  for (const loc of locations) {
    const key = `${loc.zone}:${loc.row}:${loc.col}:${loc.layer}`;
    if (!coordMap.has(key)) coordMap.set(key, []);
    coordMap.get(key)!.push(loc);
  }

  const conflictingIds = new Set<string>();
  const conflicts: ImportConflict[] = [];

  for (const [key, locs] of coordMap) {
    if (locs.length > 1) {
      const row = locs[0].row;
      const ids = locs.map((l) => l.id);
      ids.forEach((id) => conflictingIds.add(id));
      conflicts.push({
        row,
        coordinateKey: key,
        rejectedIds: ids,
        message: `行 ${row} 坐标 ${key} 冲突: ${ids.length} 个货位 (${ids.join(', ')}) 共享同一位置，已全部拒绝`,
      });
    }
  }

  const valid = locations.filter((l) => !conflictingIds.has(l.id));
  return { valid, conflicts };
}

function detectAnomalies(
  locations: Location[],
  pickRecords: PickRecord[]
): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const locationIds = new Set(locations.map((l) => l.id));

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
  importConflicts: ImportConflict[];
  filter: FilterState;
  thresholds: ThresholdConfig;
  cameraBookmarks: CameraBookmark[];
  activeBookmark: string | null;
  hoveredLocation: string | null;
  sidebarCollapsed: boolean;
  cameraState: CameraState;

  setLocations: (locs: Location[]) => ImportConflict[];
  setPickRecords: (records: PickRecord[]) => void;
  setFilter: (f: Partial<FilterState>) => void;
  setThresholds: (t: Partial<ThresholdConfig>) => void;
  addBookmark: (bm: CameraBookmark) => void;
  removeBookmark: (id: string) => void;
  setActiveBookmark: (id: string | null) => void;
  setHoveredLocation: (id: string | null) => void;
  setSidebarCollapsed: (v: boolean) => void;
  setCameraState: (cs: Partial<CameraState>) => void;
  loadSampleData: () => void;
  exportSnapshot: () => void;
  importSnapshot: (data: SnapshotData) => { success: boolean; error?: string };
  exportAnomalies: () => void;
  getHeatMap: () => Map<string, { count: number; color: string; opacity: number }>;
  getAvailableZones: () => string[];
  clearImportConflicts: () => void;
}

export const useWarehouseStore = create<WarehouseStore>()(
  persist(
    (set, get) => ({
      locations: [],
      pickRecords: [],
      anomalies: [],
      importConflicts: [],
      filter: { dateRange: null, zones: [] },
      thresholds: { low: 25, medium: 50, high: 75 },
      cameraBookmarks: [],
      activeBookmark: null,
      hoveredLocation: null,
      sidebarCollapsed: false,
      cameraState: { position: [22, 16, 24], target: [7.5, 4.5, 7.5] },

      setLocations: (locs) => {
        const { valid, conflicts } = filterConflictingLocations(locs);
        const state = get();
        const anomalies = detectAnomalies(valid, state.pickRecords);
        set({ locations: valid, anomalies, importConflicts: conflicts });
        return conflicts;
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

      setCameraState: (cs) =>
        set((state) => ({
          cameraState: { ...state.cameraState, ...cs },
        })),

      loadSampleData: () => {
        const { valid, conflicts } = filterConflictingLocations(sampleLocations);
        const anomalies = detectAnomalies(valid, samplePickRecords);
        set({
          locations: valid,
          pickRecords: samplePickRecords,
          anomalies,
          importConflicts: conflicts,
          filter: { dateRange: null, zones: [] },
        });
      },

      exportSnapshot: () => {
        const state = get();
        const activeBm = state.activeBookmark
          ? state.cameraBookmarks.find((b) => b.id === state.activeBookmark)
          : null;
        const snapshot: SnapshotData = {
          version: 1,
          exportedAt: new Date().toISOString(),
          anomalies: state.anomalies,
          importConflicts: state.importConflicts,
          filter: state.filter,
          thresholds: state.thresholds,
          cameraState: state.cameraState,
          activeBookmarkId: state.activeBookmark,
          activeBookmarkName: activeBm?.name ?? null,
          locations: state.locations,
          pickRecords: state.pickRecords,
          cameraBookmarks: state.cameraBookmarks,
        };
        const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `warehouse-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      },

      importSnapshot: (data) => {
        try {
          if (data.version !== 1) {
            return { success: false, error: `不支持的快照版本: ${data.version}` };
          }
          if (!Array.isArray(data.locations) || !Array.isArray(data.pickRecords)) {
            return { success: false, error: '快照数据缺少必要字段 (locations/pickRecords)' };
          }

          const { valid, conflicts } = filterConflictingLocations(data.locations);
          const anomalies = detectAnomalies(valid, data.pickRecords);

          set({
            locations: valid,
            pickRecords: data.pickRecords,
            anomalies,
            importConflicts: conflicts,
            filter: data.filter ?? { dateRange: null, zones: [] },
            thresholds: data.thresholds ?? { low: 25, medium: 50, high: 75 },
            cameraState: data.cameraState ?? { position: [22, 16, 24], target: [7.5, 4.5, 7.5] },
            activeBookmark: data.activeBookmarkId ?? null,
            cameraBookmarks: data.cameraBookmarks ?? [],
          });

          return { success: true };
        } catch (err) {
          return { success: false, error: `快照导入失败: ${(err as Error).message}` };
        }
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

      getAvailableZones: () => {
        const { locations } = get();
        return [...new Set(locations.map((l) => l.zone))].sort();
      },

      clearImportConflicts: () => set({ importConflicts: [] }),
    }),
    {
      name: 'warehouse-heatmap-store',
      partialize: (state) => ({
        locations: state.locations,
        pickRecords: state.pickRecords,
        anomalies: state.anomalies,
        importConflicts: state.importConflicts,
        filter: state.filter,
        thresholds: state.thresholds,
        cameraBookmarks: state.cameraBookmarks,
        cameraState: state.cameraState,
      }),
    }
  )
);
