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
  ImportWarning,
  ImportResult,
  PlaybackState,
  PlaybackLogEntry,
  PlaybackLogLevel,
} from '@/types/warehouse';
import { sampleLocations, samplePickRecords } from '@/data/sampleData';
import { getPresetById } from '@/data/demoPresets';

const KNOWN_SNAPSHOT_FIELDS = new Set([
  'version',
  'exportedAt',
  'anomalies',
  'importConflicts',
  'filter',
  'thresholds',
  'cameraState',
  'confirmedCameraState',
  'activeBookmarkId',
  'activeBookmarkName',
  'locations',
  'pickRecords',
  'cameraBookmarks',
]);

const REQUIRED_FIELDS = ['version', 'exportedAt', 'locations', 'pickRecords'] as const;

function isValidCameraState(obj: unknown): obj is CameraState {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return (
    Array.isArray(o.position) &&
    o.position.length === 3 &&
    o.position.every((n) => typeof n === 'number') &&
    Array.isArray(o.target) &&
    o.target.length === 3 &&
    o.target.every((n) => typeof n === 'number')
  );
}

function isValidCameraBookmark(obj: unknown): obj is CameraBookmark {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    Array.isArray(o.position) &&
    o.position.length === 3 &&
    Array.isArray(o.target) &&
    o.target.length === 3
  );
}

function validateAndNormalizeSnapshot(
  data: Record<string, unknown>
): { snapshot: SnapshotData; warnings: ImportWarning[] } {
  const warnings: ImportWarning[] = [];
  const version = data.version;

  if (version !== 1 && version !== 2) {
    warnings.push({
      type: 'version_mismatch',
      message: `快照版本 ${version} 与当前支持的版本 1/2 不匹配，尝试以兼容模式导入`,
      details: { snapshotVersion: version, supportedVersions: [1, 2] },
    });
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in data)) {
      warnings.push({
        type: 'missing_field',
        message: `快照缺少必要字段: ${field}，导入可能失败`,
        details: { field },
      });
    }
  }

  for (const key of Object.keys(data)) {
    if (!KNOWN_SNAPSHOT_FIELDS.has(key)) {
      warnings.push({
        type: 'unknown_field',
        message: `快照包含未知字段: ${key}，已忽略`,
        details: { field: key },
      });
    }
  }

  const defaultCameraState: CameraState = { position: [22, 16, 24], target: [7.5, 4.5, 7.5] };
  const defaultFilter: FilterState = { dateRange: null, zones: [] };
  const defaultThresholds: ThresholdConfig = { low: 25, medium: 50, high: 75 };

  let cameraState = defaultCameraState;
  if (data.cameraState !== undefined) {
    if (isValidCameraState(data.cameraState)) {
      cameraState = data.cameraState as CameraState;
    } else {
      warnings.push({
        type: 'missing_field',
        message: 'cameraState 字段格式不正确，使用默认视角',
        details: { field: 'cameraState' },
      });
    }
  } else {
    warnings.push({
      type: 'missing_field',
      message: '快照缺少 cameraState，使用默认视角',
      details: { field: 'cameraState' },
    });
  }

  let confirmedCameraState: CameraState | null = null;
  if (data.confirmedCameraState !== undefined) {
    if (data.confirmedCameraState === null) {
      confirmedCameraState = null;
    } else if (isValidCameraState(data.confirmedCameraState)) {
      confirmedCameraState = data.confirmedCameraState as CameraState;
    } else {
      warnings.push({
        type: 'missing_field',
        message: 'confirmedCameraState 字段格式不正确，置为 null',
        details: { field: 'confirmedCameraState' },
      });
    }
  }

  let activeBookmarkId: string | null = null;
  if (data.activeBookmarkId !== undefined) {
    if (typeof data.activeBookmarkId === 'string') {
      activeBookmarkId = data.activeBookmarkId;
    } else if (data.activeBookmarkId === null) {
      activeBookmarkId = null;
    } else {
      warnings.push({
        type: 'missing_field',
        message: 'activeBookmarkId 格式不正确，置为 null',
        details: { field: 'activeBookmarkId' },
      });
    }
  }

  let activeBookmarkName: string | null = null;
  if (data.activeBookmarkName !== undefined) {
    if (typeof data.activeBookmarkName === 'string') {
      activeBookmarkName = data.activeBookmarkName;
    } else if (data.activeBookmarkName === null) {
      activeBookmarkName = null;
    } else {
      warnings.push({
        type: 'missing_field',
        message: 'activeBookmarkName 格式不正确，置为 null',
        details: { field: 'activeBookmarkName' },
      });
    }
  }

  let cameraBookmarks: CameraBookmark[] = [];
  if (data.cameraBookmarks !== undefined) {
    if (Array.isArray(data.cameraBookmarks)) {
      const valid: CameraBookmark[] = [];
      const seenNames = new Map<string, number>();
      for (let i = 0; i < data.cameraBookmarks.length; i++) {
        const bm = data.cameraBookmarks[i];
        if (isValidCameraBookmark(bm)) {
          const nameCount = seenNames.get(bm.name) || 0;
          if (nameCount > 0) {
            warnings.push({
              type: 'duplicate_bookmark_name',
              message: `书签名称重复: "${bm.name}"，已自动重命名`,
              details: { name: bm.name, index: i, newName: `${bm.name} (${nameCount + 1})` },
            });
            valid.push({ ...bm, name: `${bm.name} (${nameCount + 1})` });
          } else {
            valid.push(bm);
          }
          seenNames.set(bm.name, nameCount + 1);
        } else {
          warnings.push({
            type: 'unknown_bookmark',
            message: `第 ${i} 个书签格式不正确，已跳过`,
            details: { index: i },
          });
        }
      }
      cameraBookmarks = valid;
    } else {
      warnings.push({
        type: 'missing_field',
        message: 'cameraBookmarks 格式不正确，置为空数组',
        details: { field: 'cameraBookmarks' },
      });
    }
  }

  if (activeBookmarkId && cameraBookmarks.length > 0) {
    const found = cameraBookmarks.find((b) => b.id === activeBookmarkId);
    if (!found) {
      warnings.push({
        type: 'bookmark_not_found',
        message: `快照声明的当前书签 ID "${activeBookmarkId}" 在书签列表中不存在，已清除当前书签`,
        details: { activeBookmarkId, availableIds: cameraBookmarks.map((b) => b.id) },
      });
      activeBookmarkId = null;
      activeBookmarkName = null;
    } else if (activeBookmarkName && activeBookmarkName !== found.name) {
      warnings.push({
        type: 'duplicate_bookmark_name',
        message: `快照中 activeBookmarkName "${activeBookmarkName}" 与实际书签名称 "${found.name}" 不一致，以实际为准`,
        details: { snapshotName: activeBookmarkName, actualName: found.name },
      });
      activeBookmarkName = found.name;
    } else if (!activeBookmarkName) {
      activeBookmarkName = found.name;
    }
  }

  const locations = Array.isArray(data.locations) ? (data.locations as Location[]) : [];
  const pickRecords = Array.isArray(data.pickRecords) ? (data.pickRecords as PickRecord[]) : [];
  const anomalies = Array.isArray(data.anomalies) ? (data.anomalies as Anomaly[]) : [];
  const importConflicts = Array.isArray(data.importConflicts) ? (data.importConflicts as ImportConflict[]) : [];

  let filter = defaultFilter;
  if (data.filter && typeof data.filter === 'object') {
    const f = data.filter as Record<string, unknown>;
    filter = {
      dateRange: f.dateRange as FilterState['dateRange'] ?? null,
      zones: Array.isArray(f.zones) ? (f.zones as string[]) : [],
    };
  }

  let thresholds = defaultThresholds;
  if (data.thresholds && typeof data.thresholds === 'object') {
    const t = data.thresholds as Record<string, unknown>;
    thresholds = {
      low: typeof t.low === 'number' ? t.low : 25,
      medium: typeof t.medium === 'number' ? t.medium : 50,
      high: typeof t.high === 'number' ? t.high : 75,
    };
  }

  return {
    snapshot: {
      version: 2,
      exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : new Date().toISOString(),
      anomalies,
      importConflicts,
      filter,
      thresholds,
      cameraState,
      confirmedCameraState,
      activeBookmarkId,
      activeBookmarkName,
      locations,
      pickRecords,
      cameraBookmarks,
    },
    warnings,
  };
}

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

export function buildSnapshotExportFileName(presetId?: string | null): string {
  const dateStr = new Date().toISOString().slice(0, 10);
  const timeStr = new Date().toISOString().slice(11, 19).replace(/:/g, '');
  const presetPart = presetId ? `-${presetId}` : '';
  return `warehouse-snapshot${presetPart}-${dateStr}-${timeStr}.json`;
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
  activeBookmarkName: string | null;
  hoveredLocation: string | null;
  sidebarCollapsed: boolean;
  cameraState: CameraState;
  confirmedCameraState: CameraState | null;
  importWarnings: ImportWarning[];
  playback: PlaybackState;

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
  confirmCameraState: () => void;
  loadSampleData: () => void;
  exportSnapshot: () => void;
  importSnapshot: (data: unknown, fileName?: string) => ImportResult;
  exportAnomalies: () => void;
  getHeatMap: () => Map<string, { count: number; color: string; opacity: number }>;
  getAvailableZones: () => string[];
  clearImportConflicts: () => void;
  clearImportWarnings: () => void;
  loadDemoPreset: (presetId: string) => ImportResult | null;
  addPlaybackLog: (level: PlaybackLogLevel, message: string, details?: Record<string, unknown>) => void;
  clearPlaybackLogs: () => void;
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
      activeBookmarkName: null,
      hoveredLocation: null,
      sidebarCollapsed: false,
      cameraState: { position: [22, 16, 24], target: [7.5, 4.5, 7.5] },
      confirmedCameraState: null,
      importWarnings: [],
      playback: {
        activePresetId: null,
        lastSnapshotFileName: null,
        logs: [],
      },

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
        set((state) => {
          const existing = state.cameraBookmarks.find((b) => b.id === bm.id);
          if (existing) {
            return { cameraBookmarks: state.cameraBookmarks };
          }
          const nameExists = state.cameraBookmarks.some((b) => b.name === bm.name);
          let finalBm = bm;
          if (nameExists) {
            let suffix = 1;
            while (state.cameraBookmarks.some((b) => b.name === `${bm.name} (${suffix})`)) {
              suffix++;
            }
            finalBm = { ...bm, name: `${bm.name} (${suffix})` };
          }
          return { cameraBookmarks: [...state.cameraBookmarks, finalBm] };
        }),

      removeBookmark: (id) =>
        set((state) => ({
          cameraBookmarks: state.cameraBookmarks.filter((b) => b.id !== id),
          activeBookmark: state.activeBookmark === id ? null : state.activeBookmark,
          activeBookmarkName: state.activeBookmark === id ? null : state.activeBookmarkName,
        })),

      setActiveBookmark: (id) =>
        set((state) => {
          if (id === null) {
            return { activeBookmark: null, activeBookmarkName: null };
          }
          const bm = state.cameraBookmarks.find((b) => b.id === id);
          return {
            activeBookmark: id,
            activeBookmarkName: bm ? bm.name : state.activeBookmarkName,
          };
        }),
      setHoveredLocation: (id) => set({ hoveredLocation: id }),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),

      setCameraState: (cs) =>
        set((state) => ({
          cameraState: { ...state.cameraState, ...cs },
        })),

      confirmCameraState: () =>
        set((state) => ({
          confirmedCameraState: { ...state.cameraState },
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
          version: 2,
          exportedAt: new Date().toISOString(),
          anomalies: state.anomalies,
          importConflicts: state.importConflicts,
          filter: state.filter,
          thresholds: state.thresholds,
          cameraState: state.cameraState,
          confirmedCameraState: state.confirmedCameraState,
          activeBookmarkId: state.activeBookmark,
          activeBookmarkName: activeBm?.name ?? state.activeBookmarkName ?? null,
          locations: state.locations,
          pickRecords: state.pickRecords,
          cameraBookmarks: state.cameraBookmarks,
        };
        const fileName = buildSnapshotExportFileName(state.playback.activePresetId);
        const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        get().addPlaybackLog('success', `快照已导出: ${fileName}`, { fileName });
      },

      importSnapshot: (data, fileName) => {
        try {
          if (!data || typeof data !== 'object') {
            get().addPlaybackLog(
              'error',
              fileName ? `快照导入失败 (${fileName}): 快照数据格式无效` : '快照导入失败: 快照数据格式无效',
              { fileName, error: '快照数据格式无效' }
            );
            return {
              success: false,
              error: '快照数据格式无效',
              warnings: [],
              restored: {
                cameraState: false,
                confirmedCameraState: false,
                activeBookmark: false,
                activeBookmarkName: false,
                cameraBookmarks: false,
                locations: false,
                pickRecords: false,
                filter: false,
                thresholds: false,
              },
            };
          }

          const { snapshot, warnings } = validateAndNormalizeSnapshot(
            data as Record<string, unknown>
          );

          const { valid, conflicts } = filterConflictingLocations(snapshot.locations);
          const anomalies = detectAnomalies(valid, snapshot.pickRecords);

          set({
            locations: valid,
            pickRecords: snapshot.pickRecords,
            anomalies,
            importConflicts: conflicts,
            filter: snapshot.filter,
            thresholds: snapshot.thresholds,
            cameraState: snapshot.cameraState,
            confirmedCameraState: snapshot.confirmedCameraState,
            activeBookmark: snapshot.activeBookmarkId,
            activeBookmarkName: snapshot.activeBookmarkName,
            cameraBookmarks: snapshot.cameraBookmarks,
            importWarnings: warnings,
          });

          const restored = {
            cameraState: true,
            confirmedCameraState: snapshot.confirmedCameraState !== null,
            activeBookmark: snapshot.activeBookmarkId !== null,
            activeBookmarkName: snapshot.activeBookmarkName !== null,
            cameraBookmarks: snapshot.cameraBookmarks.length > 0,
            locations: valid.length > 0,
            pickRecords: snapshot.pickRecords.length > 0,
            filter: snapshot.filter.dateRange !== null || snapshot.filter.zones.length > 0,
            thresholds:
              snapshot.thresholds.low !== 25 ||
              snapshot.thresholds.medium !== 50 ||
              snapshot.thresholds.high !== 75,
          };

          const logParts: string[] = ['快照导入结果:'];
          logParts.push(`- 成功: ${true}`);
          logParts.push(`- 警告: ${warnings.length} 条`);
          if (warnings.length > 0) {
            warnings.forEach((w, i) => logParts.push(`  [${i + 1}] ${w.message}`));
          }
          logParts.push(`- 恢复状态:`);
          Object.entries(restored).forEach(([k, v]) => {
            logParts.push(`  - ${k}: ${v ? '✓' : '-'}`);
          });
          console.info(logParts.join('\n'));

          const restoredCount = Object.values(restored).filter(Boolean).length;
          get().addPlaybackLog(
            warnings.length > 0 ? 'warning' : 'success',
            fileName
              ? `快照导入成功 (${fileName}): 恢复 ${restoredCount}/9 项状态，${warnings.length} 条警告`
              : `快照导入成功: 恢复 ${restoredCount}/9 项状态，${warnings.length} 条警告`,
            { fileName, warnings: warnings.length, restored }
          );
          if (fileName) {
            set((state) => ({
              playback: { ...state.playback, lastSnapshotFileName: fileName },
            }));
          }

          return {
            success: true,
            warnings,
            restored,
          };
        } catch (err) {
          console.error('快照导入异常:', err);
          get().addPlaybackLog(
            'error',
            `快照导入失败: ${(err as Error).message}`,
            { fileName, error: (err as Error).message }
          );
          return {
            success: false,
            error: `快照导入失败: ${(err as Error).message}`,
            warnings: [],
            restored: {
              cameraState: false,
              confirmedCameraState: false,
              activeBookmark: false,
              activeBookmarkName: false,
              cameraBookmarks: false,
              locations: false,
              pickRecords: false,
              filter: false,
              thresholds: false,
            },
          };
        }
      },

      loadDemoPreset: (presetId) => {
        const preset = getPresetById(presetId);
        if (!preset) {
          get().addPlaybackLog('error', `演示预设不存在: ${presetId}`, { presetId });
          return null;
        }
        const result = get().importSnapshot(preset.snapshot, `preset:${preset.name}`);
        if (result.success) {
          set((state) => ({
            playback: { ...state.playback, activePresetId: presetId },
          }));
          get().addPlaybackLog(
            'info',
            `已装载演示预设: ${preset.name}`,
            { presetId, presetName: preset.name }
          );
        }
        return result;
      },

      addPlaybackLog: (level, message, details) => {
        const entry: PlaybackLogEntry = {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: new Date().toISOString(),
          level,
          message,
          details,
        };
        set((state) => ({
          playback: {
            ...state.playback,
            logs: [entry, ...state.playback.logs].slice(0, 200),
          },
        }));
      },

      clearPlaybackLogs: () => {
        set((state) => ({
          playback: { ...state.playback, logs: [] },
        }));
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

      clearImportWarnings: () => set({ importWarnings: [] }),
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
        confirmedCameraState: state.confirmedCameraState,
        activeBookmark: state.activeBookmark,
        activeBookmarkName: state.activeBookmarkName,
        playback: {
          activePresetId: state.playback.activePresetId,
          lastSnapshotFileName: state.playback.lastSnapshotFileName,
          logs: [],
        },
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.activeBookmark && state.cameraBookmarks) {
          const bm = state.cameraBookmarks.find((b) => b.id === state.activeBookmark);
          if (!bm) {
            console.warn(`[persist] 持久化的 activeBookmark "${state.activeBookmark}" 不存在，已清除`);
            state.activeBookmark = null;
            state.activeBookmarkName = null;
          } else if (!state.activeBookmarkName || state.activeBookmarkName !== bm.name) {
            state.activeBookmarkName = bm.name;
          }
        }
        if (state && !state.playback) {
          state.playback = {
            activePresetId: null,
            lastSnapshotFileName: null,
            logs: [],
          };
        }
      },
    }
  )
);
