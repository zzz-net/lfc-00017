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
  SnapshotArchiveEntry,
  SnapshotArchiveState,
  SnapshotSource,
  ArchiveImportResult,
  BatchPriority,
  BatchLocation,
  ReplenishmentBatch,
  ReplenishmentConflict,
  ReplenishmentConflictType,
  ReplenishmentImportResult,
  ReplenishmentActionRecord,
  SelectionBox,
  ReplenishmentSandboxState,
  ReplenishmentExportData,
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

function generateArchiveId(): string {
  return `snap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function computeHeatmapLevel(
  locations: Location[],
  pickRecords: PickRecord[],
  thresholds: ThresholdConfig
): SnapshotArchiveEntry['summary']['heatmapLevel'] {
  if (locations.length === 0 || pickRecords.length === 0) return 'none';
  const countMap = new Map<string, number>();
  for (const rec of pickRecords) {
    countMap.set(rec.locationId, (countMap.get(rec.locationId) || 0) + rec.quantity);
  }
  const counts = locations.map((l) => countMap.get(l.id) || 0);
  const maxCount = Math.max(...counts, 1);
  if (maxCount === 0) return 'none';
  const normalizedCounts = counts.map((c) => c / maxCount);
  const levels = { low: 0, medium: 0, high: 0 };
  for (const n of normalizedCounts) {
    if (n === 0) continue;
    if (n <= thresholds.low / 100) levels.low++;
    else if (n <= thresholds.medium / 100) levels.medium++;
    else levels.high++;
  }
  const totalActive = levels.low + levels.medium + levels.high;
  if (totalActive === 0) return 'none';
  const presentLevels = [levels.low > 0, levels.medium > 0, levels.high > 0].filter(Boolean).length;
  if (presentLevels >= 2) return 'mixed';
  if (levels.high > 0) return 'high';
  if (levels.medium > 0) return 'medium';
  return 'low';
}

function buildArchiveSummary(
  snapshot: SnapshotData
): SnapshotArchiveEntry['summary'] {
  const zones = [...new Set(snapshot.locations.map((l) => l.zone))].sort();
  const activeBookmarkName = snapshot.activeBookmarkName || null;
  return {
    locationsCount: snapshot.locations.length,
    pickRecordsCount: snapshot.pickRecords.length,
    bookmarksCount: snapshot.cameraBookmarks.length,
    activeBookmarkName,
    zones,
    hasDateFilter: snapshot.filter.dateRange !== null,
    heatmapLevel: computeHeatmapLevel(snapshot.locations, snapshot.pickRecords, snapshot.thresholds),
  };
}

function createArchiveEntry(
  snapshot: SnapshotData,
  fileName: string,
  source: SnapshotSource,
  importLogs?: PlaybackLogEntry[]
): SnapshotArchiveEntry {
  return {
    id: generateArchiveId(),
    fileName,
    savedAt: new Date().toISOString(),
    source,
    schemaVersion: snapshot.version,
    summary: buildArchiveSummary(snapshot),
    snapshot,
    importLogs,
  };
}

function buildCurrentSnapshot(get: () => WarehouseStore): SnapshotData {
  const state = get();
  const activeBm = state.activeBookmark
    ? state.cameraBookmarks.find((b) => b.id === state.activeBookmark)
    : null;
  return {
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
}

function dedupFileName(existingFileNames: string[], desiredName: string): string {
  if (!existingFileNames.includes(desiredName)) return desiredName;
  const dotIdx = desiredName.lastIndexOf('.');
  const base = dotIdx > 0 ? desiredName.slice(0, dotIdx) : desiredName;
  const ext = dotIdx > 0 ? desiredName.slice(dotIdx) : '';
  let counter = 2;
  while (existingFileNames.includes(`${base} (${counter})${ext}`)) {
    counter++;
  }
  return `${base} (${counter})${ext}`;
}

interface ArchiveMergeResult {
  finalBookmarks: CameraBookmark[];
  warnings: ImportWarning[];
  finalActiveBookmarkId: string | null;
  finalActiveBookmarkName: string | null;
}

function mergeBookmarksWithExisting(
  existing: CameraBookmark[],
  incoming: CameraBookmark[],
  incomingActiveId: string | null,
  incomingActiveName: string | null
): ArchiveMergeResult {
  const warnings: ImportWarning[] = [];
  const finalBookmarks = [...existing];
  const existingNames = new Map(existing.map((b) => [b.name, 1]));
  const existingIds = new Set(existing.map((b) => b.id));

  let finalActiveId = incomingActiveId;
  let finalActiveName = incomingActiveName;

  for (const bm of incoming) {
    if (existingIds.has(bm.id)) {
      warnings.push({
        type: 'duplicate_bookmark_name',
        message: `书签 ID 重复: "${bm.id}"，导入时已跳过`,
        details: { bookmarkId: bm.id, bookmarkName: bm.name },
      });
      if (finalActiveId === bm.id) {
        finalActiveId = null;
        finalActiveName = null;
      }
      continue;
    }

    let finalName = bm.name;
    if (existingNames.has(bm.name)) {
      let suffix = 2;
      while (existingNames.has(`${bm.name} (${suffix})`)) {
        suffix++;
      }
      finalName = `${bm.name} (${suffix})`;
      warnings.push({
        type: 'duplicate_bookmark_name',
        message: `书签名称重复: "${bm.name}"，已重命名为 "${finalName}"`,
        details: { oldName: bm.name, newName: finalName, bookmarkId: bm.id },
      });
    }
    existingNames.set(finalName, 1);
    if (finalActiveId === bm.id) {
      finalActiveName = finalName;
    }
    finalBookmarks.push({ ...bm, name: finalName });
  }

  return {
    finalBookmarks,
    warnings,
    finalActiveBookmarkId: finalActiveId,
    finalActiveBookmarkName: finalActiveName,
  };
}

function validateAndNormalizeArchiveState(
  data: Record<string, unknown>
): SnapshotArchiveState {
  const defaultState: SnapshotArchiveState = {
    entries: [],
    maxEntries: 30,
    lastAutoSaveId: null,
    undoStack: [],
    currentImportSession: null,
  };

  if (!data || typeof data !== 'object') return defaultState;

  const entries = Array.isArray(data.entries)
    ? (data.entries as SnapshotArchiveEntry[]).filter(
        (e) => e && typeof e.id === 'string' && typeof e.savedAt === 'string'
      )
    : [];

  const maxEntries = typeof data.maxEntries === 'number' && data.maxEntries > 0 ? data.maxEntries : 30;
  const lastAutoSaveId = typeof data.lastAutoSaveId === 'string' ? data.lastAutoSaveId : null;
  const undoStack = Array.isArray(data.undoStack)
    ? (data.undoStack as SnapshotArchiveState['undoStack']).filter(
        (u) => u && typeof u.stateId === 'string' && u.snapshot
      )
    : [];

  return {
    entries,
    maxEntries,
    lastAutoSaveId,
    undoStack,
    currentImportSession: null,
  };
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
  archive: SnapshotArchiveState;

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

  saveToArchive: (source: SnapshotSource, fileNameOverride?: string) => SnapshotArchiveEntry | null;
  restoreFromArchive: (entryId: string) => ArchiveImportResult;
  deleteArchiveEntry: (entryId: string) => boolean;
  clearArchive: () => void;
  undoLastImport: () => ArchiveImportResult | null;
  getArchiveEntries: () => SnapshotArchiveEntry[];
  getUndoStackSize: () => number;
  clearUndoStack: () => void;
  autoSaveSnapshot: () => SnapshotArchiveEntry | null;
  getLatestArchiveEntry: () => SnapshotArchiveEntry | null;
  restoreLatestOnStartup: () => ArchiveImportResult | null;
  importSnapshotWithArchive: (data: unknown, fileName?: string, mergeBookmarks?: boolean) => ArchiveImportResult;
  exportArchiveEntry: (entryId: string) => void;

  replenishment: ReplenishmentSandboxState;
  setSelectionMode: (enabled: boolean) => void;
  setSelectionBox: (box: SelectionBox | null) => void;
  toggleLocationSelection: (locationId: string) => void;
  clearLocationSelection: () => void;
  selectLocationsByHeat: (minHeatPercent: number) => void;
  createBatchFromSelection: (opts?: { name?: string; priority?: BatchPriority }) => ReplenishmentBatch | null;
  updateBatch: (batchId: string, updates: Partial<Omit<ReplenishmentBatch, 'id' | 'createdAt'>>) => void;
  deleteBatch: (batchId: string) => void;
  addLocationToBatch: (batchId: string, locationId: string) => void;
  removeLocationFromBatch: (batchId: string, locationId: string) => void;
  adjustBatchOrder: (batchId: string, newOrder: number) => void;
  setActiveBatch: (batchId: string | null) => void;
  computeBatchLocationShortage: (locationId: string, heatLevel: number) => BatchLocation;
  exportReplenishmentBatches: () => void;
  importReplenishmentBatches: (data: unknown) => ReplenishmentImportResult;
  undoLastReplenishmentAction: () => ReplenishmentImportResult | null;
  getReplenishmentUndoStackSize: () => number;
  clearReplenishmentConflicts: () => void;
  clearReplenishmentBatches: () => void;
  saveReplenishmentDraft: () => void;
  loadReplenishmentDraft: () => boolean;
  getBatchesInProcessingOrder: () => ReplenishmentBatch[];
  getLocationOccupancyMap: () => Map<string, { batchId: string; batchNo: string }>;
  addReplenishmentActionLog: (
    action: ReplenishmentActionRecord['action'],
    description: string,
    details?: Record<string, unknown>
  ) => void;
  clearReplenishmentLogs: () => void;
  setAutoSaveEnabled: (enabled: boolean) => void;
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
      archive: {
        entries: [],
        maxEntries: 30,
        lastAutoSaveId: null,
        undoStack: [],
        currentImportSession: null,
      },
      replenishment: {
        batches: [],
        selectedLocationIds: [],
        selectionMode: false,
        selectionBox: null,
        activeBatchId: null,
        conflicts: [],
        actionLogs: [],
        undoStack: [],
        nextBatchNo: 1,
        autoSaveEnabled: false,
        lastAutoSavedAt: null,
        importSession: null,
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
        get().saveToArchive('export', fileName);
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

      saveToArchive: (source, fileNameOverride) => {
        try {
          const state = get();
          const snapshot = buildCurrentSnapshot(get);
          const existingNames = state.archive.entries.map((e) => e.fileName);
          const baseFileName = fileNameOverride || buildSnapshotExportFileName(state.playback.activePresetId);
          const finalFileName = dedupFileName(existingNames, baseFileName);
          const entry = createArchiveEntry(snapshot, finalFileName, source);
          const sorted = [entry, ...state.archive.entries]
            .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())
            .slice(0, state.archive.maxEntries);
          let lastAutoSaveId = state.archive.lastAutoSaveId;
          if (source === 'auto-save') {
            lastAutoSaveId = entry.id;
          }
          set({
            archive: {
              ...state.archive,
              entries: sorted,
              lastAutoSaveId,
            },
          });
          get().addPlaybackLog(
            'info',
            `快照已归档: ${finalFileName} (${source})`,
            { fileName: finalFileName, source, entryId: entry.id }
          );
          return entry;
        } catch (err) {
          console.error('归档保存失败:', err);
          get().addPlaybackLog(
            'error',
            `快照归档失败: ${(err as Error).message}`,
            { error: (err as Error).message }
          );
          return null;
        }
      },

      restoreFromArchive: (entryId) => {
        const state = get();
        const entry = state.archive.entries.find((e) => e.id === entryId);
        if (!entry) {
          get().addPlaybackLog('error', `恢复失败: 归档快照不存在 (${entryId})`, { entryId });
          return {
            success: false,
            error: '归档快照不存在',
            warnings: [],
            restored: {
              cameraState: false, confirmedCameraState: false, activeBookmark: false,
              activeBookmarkName: false, cameraBookmarks: false, locations: false,
              pickRecords: false, filter: false, thresholds: false,
            },
            archiveEntryId: null,
            previousStateId: null,
            canUndo: false,
          };
        }

        const previousSnapshot = buildCurrentSnapshot(get);
        const previousStateId = generateArchiveId();
        const previousEntry = createArchiveEntry(previousSnapshot, `undo-${previousStateId}.json`, 'auto-save');

        try {
          const { valid, conflicts } = filterConflictingLocations(entry.snapshot.locations);
          const anomalies = detectAnomalies(valid, entry.snapshot.pickRecords);

          set({
            locations: valid,
            pickRecords: entry.snapshot.pickRecords,
            anomalies,
            importConflicts: conflicts,
            filter: entry.snapshot.filter,
            thresholds: entry.snapshot.thresholds,
            cameraState: entry.snapshot.cameraState,
            confirmedCameraState: entry.snapshot.confirmedCameraState,
            activeBookmark: entry.snapshot.activeBookmarkId,
            activeBookmarkName: entry.snapshot.activeBookmarkName,
            cameraBookmarks: entry.snapshot.cameraBookmarks,
            importWarnings: [],
            archive: {
              ...state.archive,
              undoStack: [
                { stateId: previousStateId, snapshot: previousEntry, createdAt: new Date().toISOString() },
                ...state.archive.undoStack,
              ].slice(0, 10),
              currentImportSession: {
                previousEntryId: previousStateId,
                importLogs: [],
              },
            },
          });

          const restored = {
            cameraState: true,
            confirmedCameraState: entry.snapshot.confirmedCameraState !== null,
            activeBookmark: entry.snapshot.activeBookmarkId !== null,
            activeBookmarkName: entry.snapshot.activeBookmarkName !== null,
            cameraBookmarks: entry.snapshot.cameraBookmarks.length > 0,
            locations: valid.length > 0,
            pickRecords: entry.snapshot.pickRecords.length > 0,
            filter: entry.snapshot.filter.dateRange !== null || entry.snapshot.filter.zones.length > 0,
            thresholds:
              entry.snapshot.thresholds.low !== 25 ||
              entry.snapshot.thresholds.medium !== 50 ||
              entry.snapshot.thresholds.high !== 75,
          };

          const restoredCount = Object.values(restored).filter(Boolean).length;
          get().addPlaybackLog(
            'success',
            `从归档恢复成功 (${entry.fileName}): 恢复 ${restoredCount}/9 项状态`,
            { fileName: entry.fileName, entryId, restored }
          );

          set((s) => ({
            playback: { ...s.playback, lastSnapshotFileName: entry.fileName },
          }));

          return {
            success: true,
            warnings: [],
            restored,
            archiveEntryId: entryId,
            previousStateId,
            canUndo: true,
          };
        } catch (err) {
          console.error('从归档恢复异常:', err);
          get().addPlaybackLog(
            'error',
            `从归档恢复失败: ${(err as Error).message}`,
            { fileName: entry.fileName, entryId, error: (err as Error).message }
          );
          return {
            success: false,
            error: `恢复失败: ${(err as Error).message}`,
            warnings: [],
            restored: {
              cameraState: false, confirmedCameraState: false, activeBookmark: false,
              activeBookmarkName: false, cameraBookmarks: false, locations: false,
              pickRecords: false, filter: false, thresholds: false,
            },
            archiveEntryId: entryId,
            previousStateId: null,
            canUndo: false,
          };
        }
      },

      deleteArchiveEntry: (entryId) => {
        const state = get();
        const entry = state.archive.entries.find((e) => e.id === entryId);
        if (!entry) return false;
        const entries = state.archive.entries.filter((e) => e.id !== entryId);
        const lastAutoSaveId = state.archive.lastAutoSaveId === entryId ? null : state.archive.lastAutoSaveId;
        set({
          archive: { ...state.archive, entries, lastAutoSaveId },
        });
        get().addPlaybackLog('info', `已删除归档快照: ${entry.fileName}`, { fileName: entry.fileName, entryId });
        return true;
      },

      clearArchive: () => {
        const state = get();
        set({
          archive: { ...state.archive, entries: [], lastAutoSaveId: null },
        });
        get().addPlaybackLog('info', '归档中心已清空');
      },

      undoLastImport: () => {
        const state = get();
        if (state.archive.undoStack.length === 0) {
          get().addPlaybackLog('warning', '撤销失败: 撤销栈为空');
          return null;
        }
        const undoItem = state.archive.undoStack[0];
        const snapshot = undoItem.snapshot.snapshot;

        try {
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
            importWarnings: [],
            archive: {
              ...state.archive,
              undoStack: state.archive.undoStack.slice(1),
              currentImportSession: null,
            },
          });

          get().addPlaybackLog(
            'success',
            `已撤销导入，恢复到导入前状态 (${undoItem.snapshot.fileName})`,
            { stateId: undoItem.stateId, fileName: undoItem.snapshot.fileName }
          );

          return {
            success: true,
            warnings: [],
            restored: {
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
            },
            archiveEntryId: null,
            previousStateId: undoItem.stateId,
            canUndo: false,
          };
        } catch (err) {
          console.error('撤销异常:', err);
          get().addPlaybackLog(
            'error',
            `撤销失败: ${(err as Error).message}`,
            { error: (err as Error).message }
          );
          return null;
        }
      },

      getArchiveEntries: () => {
        return get().archive.entries;
      },

      getUndoStackSize: () => {
        return get().archive.undoStack.length;
      },

      clearUndoStack: () => {
        const state = get();
        set({ archive: { ...state.archive, undoStack: [] } });
      },

      autoSaveSnapshot: () => {
        return get().saveToArchive('auto-save');
      },

      getLatestArchiveEntry: () => {
        const entries = get().archive.entries;
        return entries.length > 0 ? entries[0] : null;
      },

      restoreLatestOnStartup: () => {
        const state = get();
        if (state.archive.entries.length === 0) {
          return null;
        }
        const latest = state.archive.entries[0];
        if (state.locations.length > 0 && state.pickRecords.length > 0) {
          get().addPlaybackLog(
            'info',
            `检测到上次状态，跳过自动恢复；最近归档: ${latest.fileName}`,
            { fileName: latest.fileName }
          );
          return null;
        }
        get().addPlaybackLog(
          'info',
          `启动自动恢复: 使用最近归档 ${latest.fileName}`,
          { fileName: latest.fileName, entryId: latest.id, source: latest.source }
        );
        return get().restoreFromArchive(latest.id);
      },

      importSnapshotWithArchive: (data, fileName, mergeBookmarks = false) => {
        const importLogs: PlaybackLogEntry[] = [];
        const state = get();
        const previousSnapshot = buildCurrentSnapshot(get);
        const previousStateId = generateArchiveId();
        const previousEntry = createArchiveEntry(previousSnapshot, `undo-${previousStateId}.json`, 'auto-save');

        try {
          if (!data || typeof data !== 'object') {
            const logMsg = fileName ? `快照导入失败 (${fileName}): 快照数据格式无效` : '快照导入失败: 快照数据格式无效';
            importLogs.push({
              id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              timestamp: new Date().toISOString(),
              level: 'error',
              message: logMsg,
              details: { fileName, error: '快照数据格式无效' },
            });
            get().addPlaybackLog('error', logMsg, { fileName, error: '快照数据格式无效' });
            return {
              success: false,
              error: '快照数据格式无效',
              warnings: [],
              restored: {
                cameraState: false, confirmedCameraState: false, activeBookmark: false,
                activeBookmarkName: false, cameraBookmarks: false, locations: false,
                pickRecords: false, filter: false, thresholds: false,
              },
              archiveEntryId: null,
              previousStateId: null,
              canUndo: false,
            };
          }

          const { snapshot, warnings } = validateAndNormalizeSnapshot(
            data as Record<string, unknown>
          );

          let finalBookmarks = snapshot.cameraBookmarks;
          let finalActiveId = snapshot.activeBookmarkId;
          let finalActiveName = snapshot.activeBookmarkName;
          let mergeWarnings: ImportWarning[] = [];

          if (mergeBookmarks && state.cameraBookmarks.length > 0) {
            const mergeResult = mergeBookmarksWithExisting(
              state.cameraBookmarks,
              snapshot.cameraBookmarks,
              snapshot.activeBookmarkId,
              snapshot.activeBookmarkName
            );
            finalBookmarks = mergeResult.finalBookmarks;
            finalActiveId = mergeResult.finalActiveBookmarkId;
            finalActiveName = mergeResult.finalActiveBookmarkName;
            mergeWarnings = mergeResult.warnings;
          }

          warnings.push(...mergeWarnings);

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
            activeBookmark: finalActiveId,
            activeBookmarkName: finalActiveName,
            cameraBookmarks: finalBookmarks,
            importWarnings: warnings,
          });

          const restored = {
            cameraState: true,
            confirmedCameraState: snapshot.confirmedCameraState !== null,
            activeBookmark: finalActiveId !== null,
            activeBookmarkName: finalActiveName !== null,
            cameraBookmarks: finalBookmarks.length > 0,
            locations: valid.length > 0,
            pickRecords: snapshot.pickRecords.length > 0,
            filter: snapshot.filter.dateRange !== null || snapshot.filter.zones.length > 0,
            thresholds:
              snapshot.thresholds.low !== 25 ||
              snapshot.thresholds.medium !== 50 ||
              snapshot.thresholds.high !== 75,
          };

          const restoredCount = Object.values(restored).filter(Boolean).length;
          const logMsg = fileName
            ? `快照导入成功 (${fileName}): 恢复 ${restoredCount}/9 项状态，${warnings.length} 条警告`
            : `快照导入成功: 恢复 ${restoredCount}/9 项状态，${warnings.length} 条警告`;
          importLogs.push({
            id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: new Date().toISOString(),
            level: warnings.length > 0 ? 'warning' : 'success',
            message: logMsg,
            details: { fileName, warnings: warnings.length, restored },
          });
          warnings.forEach((w) => {
            importLogs.push({
              id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              timestamp: new Date().toISOString(),
              level: 'warning',
              message: w.message,
              details: w.details,
            });
          });

          get().addPlaybackLog(
            warnings.length > 0 ? 'warning' : 'success',
            logMsg,
            { fileName, warnings: warnings.length, restored }
          );

          const archiveFileName = fileName || buildSnapshotExportFileName(state.playback.activePresetId);
          const archiveSnapshot: SnapshotData = {
            ...snapshot,
            cameraBookmarks: finalBookmarks,
            activeBookmarkId: finalActiveId,
            activeBookmarkName: finalActiveName,
          };

          const existingNames = state.archive.entries.map((e) => e.fileName);
          const finalFileName = dedupFileName(existingNames, archiveFileName);
          const archiveEntry = createArchiveEntry(archiveSnapshot, finalFileName, 'import', importLogs);

          const sorted = [archiveEntry, ...state.archive.entries]
            .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())
            .slice(0, state.archive.maxEntries);

          set((s) => ({
            playback: { ...s.playback, lastSnapshotFileName: fileName ?? archiveFileName },
            archive: {
              ...s.archive,
              entries: sorted,
              undoStack: [
                { stateId: previousStateId, snapshot: previousEntry, createdAt: new Date().toISOString() },
                ...s.archive.undoStack,
              ].slice(0, 10),
              currentImportSession: {
                previousEntryId: previousStateId,
                importLogs,
              },
            },
          }));

          return {
            success: true,
            warnings,
            restored,
            archiveEntryId: archiveEntry.id,
            previousStateId,
            canUndo: true,
          };
        } catch (err) {
          console.error('快照导入异常:', err);
          const errorMsg = `快照导入失败: ${(err as Error).message}`;
          importLogs.push({
            id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: new Date().toISOString(),
            level: 'error',
            message: errorMsg,
            details: { fileName, error: (err as Error).message },
          });
          get().addPlaybackLog('error', errorMsg, { fileName, error: (err as Error).message });
          return {
            success: false,
            error: (err as Error).message,
            warnings: [],
            restored: {
              cameraState: false, confirmedCameraState: false, activeBookmark: false,
              activeBookmarkName: false, cameraBookmarks: false, locations: false,
              pickRecords: false, filter: false, thresholds: false,
            },
            archiveEntryId: null,
            previousStateId: null,
            canUndo: false,
          };
        }
      },

      exportArchiveEntry: (entryId) => {
        const state = get();
        const entry = state.archive.entries.find((e) => e.id === entryId);
        if (!entry) {
          get().addPlaybackLog('error', `导出失败: 归档快照不存在 (${entryId})`, { entryId });
          return;
        }
        const blob = new Blob([JSON.stringify(entry.snapshot, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = entry.fileName;
        a.click();
        URL.revokeObjectURL(url);
        get().addPlaybackLog(
          'success',
          `归档快照已导出: ${entry.fileName}`,
          { fileName: entry.fileName, entryId }
        );
      },

      setSelectionMode: (enabled) =>
        set((state) => ({
          replenishment: {
            ...state.replenishment,
            selectionMode: enabled,
            selectedLocationIds: enabled ? state.replenishment.selectedLocationIds : [],
            selectionBox: enabled ? state.replenishment.selectionBox : null,
          },
        })),

      setSelectionBox: (box) =>
        set((state) => ({
          replenishment: { ...state.replenishment, selectionBox: box },
        })),

      toggleLocationSelection: (locationId) =>
        set((state) => {
          const exists = state.replenishment.selectedLocationIds.includes(locationId);
          return {
            replenishment: {
              ...state.replenishment,
              selectedLocationIds: exists
                ? state.replenishment.selectedLocationIds.filter((id) => id !== locationId)
                : [...state.replenishment.selectedLocationIds, locationId],
            },
          };
        }),

      clearLocationSelection: () =>
        set((state) => ({
          replenishment: { ...state.replenishment, selectedLocationIds: [], selectionBox: null },
        })),

      selectLocationsByHeat: (minHeatPercent) => {
        const state = get();
        const heatMap = computeHeatMap(
          state.locations,
          state.pickRecords,
          state.filter,
          state.thresholds
        );
        const counts = [...heatMap.values()].map((v) => v.count);
        const maxCount = Math.max(...counts, 1);
        const threshold = (minHeatPercent / 100) * maxCount;

        const selectedIds: string[] = [];
        heatMap.forEach((value, locId) => {
          if (value.count >= threshold) {
            selectedIds.push(locId);
          }
        });

        set((s) => ({
          replenishment: { ...s.replenishment, selectedLocationIds: selectedIds },
        }));
        get().addReplenishmentActionLog(
          'update',
          `按热度阈值 ${minHeatPercent}% 圈选了 ${selectedIds.length} 个高热货位`,
          { minHeatPercent, selectedCount: selectedIds.length }
        );
      },

      computeBatchLocationShortage: (locationId, heatLevel) => {
        const state = get();
        const location = state.locations.find((l) => l.id === locationId);
        const heatMap = computeHeatMap(
          state.locations,
          state.pickRecords,
          state.filter,
          state.thresholds
        );
        const heatData = heatMap.get(locationId);
        const count = heatData?.count ?? 0;
        const counts = [...heatMap.values()].map((v) => v.count);
        const maxCount = Math.max(...counts, 1);
        const actualHeatLevel = Math.round((count / maxCount) * 100);

        const baseTarget = 100;
        const heatMultiplier = 1 + (actualHeatLevel / 100) * 2;
        const targetStock = Math.round(baseTarget * heatMultiplier);
        const currentStock = Math.max(0, Math.round(targetStock * (1 - actualHeatLevel / 150)));
        const shortage = Math.max(0, targetStock - currentStock);

        return {
          locationId,
          currentStock,
          targetStock,
          shortage,
          heatLevel: actualHeatLevel,
        };
      },

      createBatchFromSelection: (opts) => {
        const state = get();
        const { selectedLocationIds, nextBatchNo, batches } = state.replenishment;

        if (selectedLocationIds.length === 0) {
          get().addReplenishmentActionLog(
            'create',
            '创建批次失败：未选择任何货位',
            { reason: 'no_selection' }
          );
          return null;
        }

        const occupancy = get().getLocationOccupancyMap();
        const occupiedLocs: string[] = [];
        const validLocs: string[] = [];

        for (const locId of selectedLocationIds) {
          if (occupancy.has(locId)) {
            occupiedLocs.push(locId);
          } else {
            validLocs.push(locId);
          }
        }

        if (validLocs.length === 0) {
          set((s) => ({
            replenishment: {
              ...s.replenishment,
              conflicts: [
                ...s.replenishment.conflicts,
                {
                  type: 'location_occupied',
                  message: `所选 ${selectedLocationIds.length} 个货位均已被其他批次占用`,
                  locationId: occupiedLocs[0],
                  details: { occupiedLocationIds: occupiedLocs },
                  resolved: false,
                  resolution: 'skip',
                },
              ],
            },
          }));
          get().addReplenishmentActionLog(
            'create',
            '创建批次失败：所有选中货位均被占用',
            { occupiedLocationIds: occupiedLocs }
          );
          return null;
        }

        const batchLocations: BatchLocation[] = validLocs.map((locId) => {
          const loc = state.locations.find((l) => l.id === locId);
          return get().computeBatchLocationShortage(locId, 0);
        });

        const totalShortage = batchLocations.reduce((sum, bl) => sum + bl.shortage, 0);
        const avgHeat = batchLocations.length > 0
          ? batchLocations.reduce((s, bl) => s + bl.heatLevel, 0) / batchLocations.length
          : 0;

        let priority: BatchPriority = 'medium';
        if (avgHeat >= 80) priority = 'critical';
        else if (avgHeat >= 60) priority = 'high';
        else if (avgHeat >= 30) priority = 'medium';
        else priority = 'low';
        if (opts?.priority) priority = opts.priority;

        const now = new Date().toISOString();
        const batchNo = `RPL-${String(nextBatchNo).padStart(4, '0')}`;
        const maxOrder = batches.length > 0 ? Math.max(...batches.map((b) => b.estimatedOrder)) : 0;

        const newBatch: ReplenishmentBatch = {
          id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          batchNo,
          name: opts?.name ?? `补货批次 ${batchNo}`,
          priority,
          status: 'draft',
          createdAt: now,
          updatedAt: now,
          estimatedOrder: maxOrder + 1,
          locations: batchLocations,
          totalShortage,
        };

        const previousBatches = JSON.parse(JSON.stringify(batches));
        const actionId = `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        const newConflicts: ReplenishmentConflict[] = [...state.replenishment.conflicts];
        if (occupiedLocs.length > 0) {
          newConflicts.push({
            type: 'location_occupied',
            message: `创建批次时跳过 ${occupiedLocs.length} 个已被占用的货位`,
            details: { skippedLocationIds: occupiedLocs, batchNo },
            batchNo,
            resolved: true,
            resolution: 'skip',
          });
        }

        set((s) => ({
          replenishment: {
            ...s.replenishment,
            batches: [...s.replenishment.batches, newBatch],
            nextBatchNo: s.replenishment.nextBatchNo + 1,
            selectedLocationIds: [],
            selectionBox: null,
            conflicts: newConflicts,
            activeBatchId: newBatch.id,
            undoStack: [
              {
                actionId,
                batches: previousBatches,
                timestamp: now,
                description: `撤销创建批次 ${batchNo}`,
              },
              ...s.replenishment.undoStack,
            ].slice(0, 20),
          },
        }));

        get().addReplenishmentActionLog(
          'create',
          `创建补货批次 ${batchNo}: ${validLocs.length} 个货位，总缺口 ${totalShortage}，优先级 ${priority}`,
          {
            batchId: newBatch.id,
            batchNo,
            locationCount: validLocs.length,
            totalShortage,
            priority,
            skippedCount: occupiedLocs.length,
          }
        );

        if (state.replenishment.autoSaveEnabled) {
          get().saveReplenishmentDraft();
        }

        return newBatch;
      },

      updateBatch: (batchId, updates) => {
        const state = get();
        const previousBatches = JSON.parse(JSON.stringify(state.replenishment.batches));
        const actionId = `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const batch = state.replenishment.batches.find((b) => b.id === batchId);
        if (!batch) return;

        set((s) => ({
          replenishment: {
            ...s.replenishment,
            batches: s.replenishment.batches.map((b) =>
              b.id === batchId
                ? {
                    ...b,
                    ...updates,
                    updatedAt: new Date().toISOString(),
                    totalShortage: updates.locations
                      ? updates.locations.reduce((sum, bl) => sum + bl.shortage, 0)
                      : b.totalShortage,
                  }
                : b
            ),
            undoStack: [
              {
                actionId,
                batches: previousBatches,
                timestamp: new Date().toISOString(),
                description: `撤销更新批次 ${batch.batchNo}`,
              },
              ...s.replenishment.undoStack,
            ].slice(0, 20),
          },
        }));

        get().addReplenishmentActionLog(
          'update',
          `更新批次 ${batch.batchNo}`,
          { batchId, batchNo: batch.batchNo, updatedFields: Object.keys(updates) }
        );

        if (state.replenishment.autoSaveEnabled) {
          get().saveReplenishmentDraft();
        }
      },

      deleteBatch: (batchId) => {
        const state = get();
        const batch = state.replenishment.batches.find((b) => b.id === batchId);
        if (!batch) return;

        const previousBatches = JSON.parse(JSON.stringify(state.replenishment.batches));
        const actionId = `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        set((s) => ({
          replenishment: {
            ...s.replenishment,
            batches: s.replenishment.batches.filter((b) => b.id !== batchId),
            activeBatchId: s.replenishment.activeBatchId === batchId ? null : s.replenishment.activeBatchId,
            undoStack: [
              {
                actionId,
                batches: previousBatches,
                timestamp: new Date().toISOString(),
                description: `撤销删除批次 ${batch.batchNo}`,
              },
              ...s.replenishment.undoStack,
            ].slice(0, 20),
          },
        }));

        get().addReplenishmentActionLog(
          'delete',
          `删除批次 ${batch.batchNo}（${batch.locations.length} 个货位）`,
          { batchId, batchNo: batch.batchNo, locationCount: batch.locations.length }
        );

        if (state.replenishment.autoSaveEnabled) {
          get().saveReplenishmentDraft();
        }
      },

      addLocationToBatch: (batchId, locationId) => {
        const state = get();
        const batch = state.replenishment.batches.find((b) => b.id === batchId);
        if (!batch) return;

        const occupancy = get().getLocationOccupancyMap();
        if (occupancy.has(locationId) && occupancy.get(locationId)!.batchId !== batchId) {
          const conflict: ReplenishmentConflict = {
            type: 'location_occupied',
            message: `货位 ${locationId} 已被批次 ${occupancy.get(locationId)!.batchNo} 占用`,
            locationId,
            batchNo: batch.batchNo,
            details: { occupiedByBatchNo: occupancy.get(locationId)!.batchNo },
            resolved: false,
            resolution: 'skip',
          };
          set((s) => ({
            replenishment: {
              ...s.replenishment,
              conflicts: [...s.replenishment.conflicts, conflict],
            },
          }));
          return;
        }

        if (batch.locations.some((bl) => bl.locationId === locationId)) return;

        const batchLoc = get().computeBatchLocationShortage(locationId, 0);
        get().updateBatch(batchId, {
          locations: [...batch.locations, batchLoc],
        });
        get().addReplenishmentActionLog(
          'update',
          `批次 ${batch.batchNo} 添加货位 ${locationId}（缺口 ${batchLoc.shortage}）`,
          { batchId, locationId, shortage: batchLoc.shortage }
        );
      },

      removeLocationFromBatch: (batchId, locationId) => {
        const state = get();
        const batch = state.replenishment.batches.find((b) => b.id === batchId);
        if (!batch) return;

        const filtered = batch.locations.filter((bl) => bl.locationId !== locationId);
        get().updateBatch(batchId, { locations: filtered });
        get().addReplenishmentActionLog(
          'update',
          `批次 ${batch.batchNo} 移除货位 ${locationId}`,
          { batchId, locationId }
        );
      },

      adjustBatchOrder: (batchId, newOrder) => {
        const state = get();
        const previousBatches = JSON.parse(JSON.stringify(state.replenishment.batches));
        const actionId = `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const batches = [...state.replenishment.batches];
        const batch = batches.find((b) => b.id === batchId);
        if (!batch) return;

        const oldOrder = batch.estimatedOrder;
        const minOrder = 1;
        const maxOrder = batches.length;
        const clampedNewOrder = Math.max(minOrder, Math.min(maxOrder, newOrder));

        if (clampedNewOrder < oldOrder) {
          batches.forEach((b) => {
            if (b.estimatedOrder >= clampedNewOrder && b.estimatedOrder < oldOrder) {
              b.estimatedOrder++;
            }
          });
        } else if (clampedNewOrder > oldOrder) {
          batches.forEach((b) => {
            if (b.estimatedOrder > oldOrder && b.estimatedOrder <= clampedNewOrder) {
              b.estimatedOrder--;
            }
          });
        }

        const targetBatch = batches.find((b) => b.id === batchId)!;
        targetBatch.estimatedOrder = clampedNewOrder;
        targetBatch.updatedAt = new Date().toISOString();

        set((s) => ({
          replenishment: {
            ...s.replenishment,
            batches,
            undoStack: [
              {
                actionId,
                batches: previousBatches,
                timestamp: new Date().toISOString(),
                description: `撤销调整批次 ${batch.batchNo} 顺序`,
              },
              ...s.replenishment.undoStack,
            ].slice(0, 20),
          },
        }));

        get().addReplenishmentActionLog(
          'adjust_order',
          `批次 ${batch.batchNo} 处理顺序: ${oldOrder} → ${clampedNewOrder}`,
          { batchId, batchNo: batch.batchNo, oldOrder, newOrder: clampedNewOrder }
        );

        if (state.replenishment.autoSaveEnabled) {
          get().saveReplenishmentDraft();
        }
      },

      setActiveBatch: (batchId) =>
        set((state) => ({
          replenishment: { ...state.replenishment, activeBatchId: batchId },
        })),

      getBatchesInProcessingOrder: () => {
        const state = get();
        const priorityOrder: Record<BatchPriority, number> = {
          critical: 0,
          high: 1,
          medium: 2,
          low: 3,
        };
        return [...state.replenishment.batches].sort((a, b) => {
          if (a.estimatedOrder !== b.estimatedOrder) {
            return a.estimatedOrder - b.estimatedOrder;
          }
          if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
            return priorityOrder[a.priority] - priorityOrder[b.priority];
          }
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });
      },

      getLocationOccupancyMap: () => {
        const state = get();
        const map = new Map<string, { batchId: string; batchNo: string }>();
        for (const batch of state.replenishment.batches) {
          for (const loc of batch.locations) {
            map.set(loc.locationId, { batchId: batch.id, batchNo: batch.batchNo });
          }
        }
        return map;
      },

      exportReplenishmentBatches: () => {
        const state = get();
        const batches = state.replenishment.batches;
        const priorityBreakdown: Record<BatchPriority, number> = {
          critical: 0, high: 0, medium: 0, low: 0,
        };
        let totalLocations = 0;
        let totalShortage = 0;

        for (const b of batches) {
          priorityBreakdown[b.priority]++;
          totalLocations += b.locations.length;
          totalShortage += b.totalShortage;
        }

        const exportData: ReplenishmentExportData = {
          version: 1,
          exportedAt: new Date().toISOString(),
          batches,
          summary: {
            totalBatches: batches.length,
            totalLocations,
            totalShortage,
            priorityBreakdown,
          },
        };

        const fileName = `replenishment-batches-${new Date().toISOString().slice(0, 10)}-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.json`;
        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);

        get().addReplenishmentActionLog(
          'update',
          `已导出 ${batches.length} 个补货批次到 ${fileName}`,
          { fileName, batchCount: batches.length }
        );
        get().addPlaybackLog(
          'success',
          `补货批次已导出: ${fileName}（${batches.length} 个批次）`,
          { fileName, batchCount: batches.length }
        );
      },

      importReplenishmentBatches: (data) => {
        const state = get();
        const now = new Date().toISOString();
        const previousBatches = JSON.parse(JSON.stringify(state.replenishment.batches));
        const actionId = `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const conflicts: ReplenishmentConflict[] = [];
        const warnings: string[] = [];

        try {
          if (!data || typeof data !== 'object') {
            return {
              success: false,
              importedBatches: 0,
              skippedBatches: 0,
              conflicts: [{
                type: 'missing_required_field',
                message: '导入数据格式无效',
                resolved: false,
              }],
              warnings: ['数据不是有效的 JSON 对象'],
              canUndo: false,
            };
          }

          const obj = data as Record<string, unknown>;

          if (obj.version !== 1) {
            conflicts.push({
              type: 'version_mismatch',
              message: `导入数据版本 ${obj.version} 与当前版本 1 不匹配，尝试兼容导入`,
              details: { importedVersion: obj.version, currentVersion: 1 },
              resolved: true,
              resolution: 'merge',
            });
            warnings.push(`版本不匹配: v${obj.version}，以兼容模式处理`);
          }

          const incomingBatchesRaw = obj.batches;
          if (!Array.isArray(incomingBatchesRaw)) {
            return {
              success: false,
              importedBatches: 0,
              skippedBatches: 0,
              conflicts: [{
                type: 'missing_required_field',
                message: '缺少必填字段 batches',
                details: { field: 'batches' },
                resolved: false,
              }],
              warnings: ['缺少 batches 字段'],
              canUndo: false,
            };
          }

          const requiredBatchFields = ['id', 'batchNo', 'name', 'priority', 'status', 'locations', 'estimatedOrder'] as const;
          const existingBatchNos = new Set(state.replenishment.batches.map((b) => b.batchNo));
          const occupancy = get().getLocationOccupancyMap();
          const validLocationIds = new Set(state.locations.map((l) => l.id));
          const finalBatches: ReplenishmentBatch[] = [];
          let imported = 0;
          let skipped = 0;
          let maxNextBatchNo = state.replenishment.nextBatchNo;

          for (let i = 0; i < incomingBatchesRaw.length; i++) {
            const raw = incomingBatchesRaw[i] as Record<string, unknown>;
            const missingFields: string[] = [];

            for (const field of requiredBatchFields) {
              if (!(field in raw)) {
                missingFields.push(field);
              }
            }

            if (missingFields.length > 0) {
              conflicts.push({
                type: 'missing_required_field',
                message: `第 ${i + 1} 个批次缺少必填字段: ${missingFields.join(', ')}，已跳过`,
                details: { index: i, missingFields },
                resolved: true,
                resolution: 'skip',
              });
              warnings.push(`批次 #${i + 1} 缺字段: ${missingFields.join(', ')}，跳过`);
              skipped++;
              continue;
            }

            let batchNo = String(raw.batchNo);
            if (existingBatchNos.has(batchNo)) {
              const oldNo = batchNo;
              let suffix = 2;
              while (existingBatchNos.has(`${batchNo}-(${suffix})`)) {
                suffix++;
              }
              batchNo = `${batchNo}-(${suffix})`;
              conflicts.push({
                type: 'duplicate_batch_no',
                message: `批次编号 ${oldNo} 重复，已自动重命名为 ${batchNo}`,
                batchNo,
                details: { originalBatchNo: oldNo, renamedBatchNo: batchNo },
                resolved: true,
                resolution: 'rename',
              });
              warnings.push(`批次编号重复: ${oldNo} → ${batchNo}`);
            }

            const rawLocations = Array.isArray(raw.locations) ? raw.locations : [];
            const validBatchLocations: BatchLocation[] = [];

            for (const rl of rawLocations as unknown[]) {
              if (!rl || typeof rl !== 'object') continue;
              const locObj = rl as Record<string, unknown>;
              const locId = String(locObj.locationId ?? '');

              if (!locId) continue;
              if (!validLocationIds.has(locId)) {
                conflicts.push({
                  type: 'unknown_location',
                  message: `批次 ${batchNo} 包含未知货位 ${locId}，已跳过`,
                  locationId: locId,
                  batchNo,
                  details: { locationId: locId },
                  resolved: true,
                  resolution: 'skip',
                });
                continue;
              }

              if (occupancy.has(locId)) {
                conflicts.push({
                  type: 'location_occupied',
                  message: `货位 ${locId} 已被现有批次 ${occupancy.get(locId)!.batchNo} 占用，批次 ${batchNo} 跳过该货位`,
                  locationId: locId,
                  batchNo,
                  details: { occupiedByBatchNo: occupancy.get(locId)!.batchNo },
                  resolved: true,
                  resolution: 'skip',
                });
                continue;
              }

              if (finalBatches.some((b) => b.locations.some((bl) => bl.locationId === locId))) {
                conflicts.push({
                  type: 'location_occupied',
                  message: `货位 ${locId} 在导入文件内重复出现，批次 ${batchNo} 跳过重复项`,
                  locationId: locId,
                  batchNo,
                  resolved: true,
                  resolution: 'skip',
                });
                continue;
              }

              const bl: BatchLocation = {
                locationId: locId,
                currentStock: typeof locObj.currentStock === 'number' ? locObj.currentStock : 0,
                targetStock: typeof locObj.targetStock === 'number' ? locObj.targetStock : 100,
                shortage: typeof locObj.shortage === 'number' ? locObj.shortage : 0,
                heatLevel: typeof locObj.heatLevel === 'number' ? locObj.heatLevel : 0,
              };

              if (bl.shortage <= 0 && bl.targetStock > bl.currentStock) {
                bl.shortage = bl.targetStock - bl.currentStock;
              }

              validBatchLocations.push(bl);
              occupancy.set(locId, { batchId: String(raw.id ?? ''), batchNo });
            }

            if (validBatchLocations.length === 0) {
              conflicts.push({
                type: 'missing_required_field',
                message: `批次 ${batchNo} 无有效货位，已跳过`,
                batchNo,
                details: { reason: 'no_valid_locations' },
                resolved: true,
                resolution: 'skip',
              });
              skipped++;
              continue;
            }

            const batch: ReplenishmentBatch = {
              id: typeof raw.id === 'string' && raw.id
                ? raw.id
                : `imp-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
              batchNo,
              name: String(raw.name ?? batchNo),
              priority: ['critical', 'high', 'medium', 'low'].includes(String(raw.priority))
                ? raw.priority as BatchPriority
                : 'medium',
              status: ['draft', 'pending', 'processing', 'completed'].includes(String(raw.status))
                ? raw.status as ReplenishmentBatch['status']
                : 'draft',
              createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
              updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
              estimatedOrder: typeof raw.estimatedOrder === 'number' ? raw.estimatedOrder : 9999,
              locations: validBatchLocations,
              totalShortage: typeof raw.totalShortage === 'number'
                ? raw.totalShortage
                : validBatchLocations.reduce((s, bl) => s + bl.shortage, 0),
              notes: typeof raw.notes === 'string' ? raw.notes : undefined,
            };

            finalBatches.push(batch);
            existingBatchNos.add(batchNo);
            imported++;

            const noMatch = batchNo.match(/RPL-(\d+)/);
            if (noMatch) {
              const n = parseInt(noMatch[1], 10) + 1;
              if (n > maxNextBatchNo) maxNextBatchNo = n;
            }
          }

          const orderedBatches = [...state.replenishment.batches, ...finalBatches];
          const existingMaxOrder = state.replenishment.batches.length > 0
            ? Math.max(...state.replenishment.batches.map((b) => b.estimatedOrder))
            : 0;
          const importedUnsorted = finalBatches.filter((b) => b.estimatedOrder === 9999);
          importedUnsorted.forEach((b, idx) => {
            const target = orderedBatches.find((ob) => ob.id === b.id);
            if (target) target.estimatedOrder = existingMaxOrder + idx + 1;
          });

          set((s) => ({
            replenishment: {
              ...s.replenishment,
              batches: orderedBatches,
              conflicts: [...s.replenishment.conflicts, ...conflicts],
              nextBatchNo: maxNextBatchNo,
              undoStack: [
                {
                  actionId,
                  batches: previousBatches,
                  timestamp: now,
                  description: `撤销导入补货批次（${imported} 个）`,
                },
                ...s.replenishment.undoStack,
              ].slice(0, 20),
              importSession: {
                previousBatches,
                actionId,
              },
              lastAutoSavedAt: s.replenishment.autoSaveEnabled ? now : s.replenishment.lastAutoSavedAt,
            },
          }));

          get().addReplenishmentActionLog(
            'import',
            `导入补货批次完成: 成功 ${imported} 个，跳过 ${skipped} 个，冲突 ${conflicts.length} 条`,
            { imported, skipped, conflictCount: conflicts.length, actionId }
          );
          get().addPlaybackLog(
            conflicts.length > 0 ? 'warning' : 'success',
            `补货批次导入: 成功 ${imported} 个，跳过 ${skipped} 个，冲突 ${conflicts.length} 条，可撤销`,
            { imported, skipped, conflictCount: conflicts.length }
          );

          if (state.replenishment.autoSaveEnabled) {
            get().saveReplenishmentDraft();
          }

          return {
            success: true,
            importedBatches: imported,
            skippedBatches: skipped,
            conflicts,
            warnings,
            canUndo: true,
            actionId,
          };
        } catch (err) {
          console.error('补货批次导入异常:', err);
          get().addPlaybackLog(
            'error',
            `补货批次导入失败: ${(err as Error).message}`,
            { error: (err as Error).message }
          );
          return {
            success: false,
            importedBatches: 0,
            skippedBatches: 0,
            conflicts: [...conflicts, {
              type: 'missing_required_field',
              message: `导入异常: ${(err as Error).message}`,
              resolved: false,
            }],
            warnings: [...warnings, `异常: ${(err as Error).message}`],
            canUndo: false,
          };
        }
      },

      undoLastReplenishmentAction: () => {
        const state = get();
        if (state.replenishment.undoStack.length === 0) {
          get().addPlaybackLog('warning', '撤销失败: 补货沙盘撤销栈为空');
          return null;
        }

        const undoItem = state.replenishment.undoStack[0];
        const previousBatches = undoItem.batches;

        set((s) => ({
          replenishment: {
            ...s.replenishment,
            batches: previousBatches,
            undoStack: s.replenishment.undoStack.slice(1),
            importSession: null,
            lastAutoSavedAt: s.replenishment.autoSaveEnabled ? new Date().toISOString() : s.replenishment.lastAutoSavedAt,
          },
        }));

        get().addReplenishmentActionLog(
          'update',
          `已撤销: ${undoItem.description}`,
          { actionId: undoItem.actionId }
        );
        get().addPlaybackLog(
          'success',
          `补货沙盘: ${undoItem.description}`,
          { actionId: undoItem.actionId }
        );

        if (state.replenishment.autoSaveEnabled) {
          get().saveReplenishmentDraft();
        }

        return {
          success: true,
          importedBatches: 0,
          skippedBatches: 0,
          conflicts: [],
          warnings: [],
          canUndo: state.replenishment.undoStack.length > 1,
        };
      },

      getReplenishmentUndoStackSize: () => get().replenishment.undoStack.length,

      clearReplenishmentConflicts: () =>
        set((state) => ({
          replenishment: { ...state.replenishment, conflicts: [] },
        })),

      clearReplenishmentBatches: () => {
        const state = get();
        const previousBatches = JSON.parse(JSON.stringify(state.replenishment.batches));
        const actionId = `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        set((s) => ({
          replenishment: {
            ...s.replenishment,
            batches: [],
            selectedLocationIds: [],
            activeBatchId: null,
            selectionBox: null,
            nextBatchNo: 1,
            undoStack: [
              {
                actionId,
                batches: previousBatches,
                timestamp: new Date().toISOString(),
                description: `撤销清空全部批次（${previousBatches.length} 个）`,
              },
              ...s.replenishment.undoStack,
            ].slice(0, 20),
          },
        }));

        get().addReplenishmentActionLog(
          'delete',
          `清空全部 ${previousBatches.length} 个补货批次`,
          { clearedCount: previousBatches.length }
        );

        if (state.replenishment.autoSaveEnabled) {
          get().saveReplenishmentDraft();
        }
      },

      saveReplenishmentDraft: () => {
        try {
          const state = get();
          const draft = {
            version: 1 as const,
            savedAt: new Date().toISOString(),
            batches: state.replenishment.batches,
            nextBatchNo: state.replenishment.nextBatchNo,
          };
          localStorage.setItem('replenishment-draft', JSON.stringify(draft));
          set((s) => ({
            replenishment: { ...s.replenishment, lastAutoSavedAt: new Date().toISOString() },
          }));
        } catch (err) {
          console.error('保存补货草稿失败:', err);
          get().addPlaybackLog(
            'error',
            `保存补货草稿失败: ${(err as Error).message}`,
            { error: (err as Error).message }
          );
        }
      },

      loadReplenishmentDraft: () => {
        try {
          const raw = localStorage.getItem('replenishment-draft');
          if (!raw) return false;
          const parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== 'object') return false;

          const conflicts: ReplenishmentConflict[] = [];
          if (parsed.version !== 1) {
            conflicts.push({
              type: 'version_mismatch',
              message: `草稿版本 ${parsed.version} 与当前版本 1 不匹配，尝试恢复`,
              details: { draftVersion: parsed.version },
              resolved: true,
              resolution: 'merge',
            });
          }

          const batches = Array.isArray(parsed.batches) ? parsed.batches : [];
          const nextBatchNo = typeof parsed.nextBatchNo === 'number' ? parsed.nextBatchNo : 1;

          set((state) => ({
            replenishment: {
              ...state.replenishment,
              batches,
              nextBatchNo,
              conflicts: [...state.replenishment.conflicts, ...conflicts],
              lastAutoSavedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : null,
            },
          }));

          if (batches.length > 0) {
            get().addReplenishmentActionLog(
              'import',
              `从本地草稿恢复 ${batches.length} 个补货批次`,
              { draftSavedAt: parsed.savedAt, batchCount: batches.length }
            );
            get().addPlaybackLog(
              'info',
              `补货沙盘: 已从本地草稿恢复 ${batches.length} 个批次`,
              { batchCount: batches.length }
            );
          }
          return true;
        } catch (err) {
          console.error('加载补货草稿失败:', err);
          return false;
        }
      },

      addReplenishmentActionLog: (action, description, details) => {
        const record: ReplenishmentActionRecord = {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: new Date().toISOString(),
          action,
          description,
          details,
        };
        set((state) => ({
          replenishment: {
            ...state.replenishment,
            actionLogs: [record, ...state.replenishment.actionLogs].slice(0, 100),
          },
        }));
      },

      clearReplenishmentLogs: () =>
        set((state) => ({
          replenishment: { ...state.replenishment, actionLogs: [] },
        })),

      setAutoSaveEnabled: (enabled) =>
        set((state) => ({
          replenishment: { ...state.replenishment, autoSaveEnabled: enabled },
        })),
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
        archive: {
          entries: state.archive.entries,
          maxEntries: state.archive.maxEntries,
          lastAutoSaveId: state.archive.lastAutoSaveId,
          undoStack: state.archive.undoStack,
          currentImportSession: null,
        },
        replenishment: {
          batches: state.replenishment.batches,
          selectedLocationIds: [],
          selectionMode: false,
          selectionBox: null,
          activeBatchId: state.replenishment.activeBatchId,
          conflicts: state.replenishment.conflicts,
          actionLogs: [],
          undoStack: state.replenishment.undoStack.slice(0, 5),
          nextBatchNo: state.replenishment.nextBatchNo,
          autoSaveEnabled: state.replenishment.autoSaveEnabled,
          lastAutoSavedAt: state.replenishment.lastAutoSavedAt,
          importSession: null,
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
        if (state && !state.archive) {
          state.archive = {
            entries: [],
            maxEntries: 30,
            lastAutoSaveId: null,
            undoStack: [],
            currentImportSession: null,
          };
        }
        if (state?.archive && typeof state.archive === 'object') {
          const normalized = validateAndNormalizeArchiveState(state.archive as unknown as Record<string, unknown>);
          state.archive = normalized;
        }
        if (state && !state.replenishment) {
          state.replenishment = {
            batches: [],
            selectedLocationIds: [],
            selectionMode: false,
            selectionBox: null,
            activeBatchId: null,
            conflicts: [],
            actionLogs: [],
            undoStack: [],
            nextBatchNo: 1,
            autoSaveEnabled: true,
            lastAutoSavedAt: null,
            importSession: null,
          };
        }
      },
    }
  )
);
