export interface Location {
  id: string;
  zone: string;
  row: number;
  col: number;
  layer: number;
  x: number;
  y: number;
  z: number;
}

export interface PickRecord {
  locationId: string;
  timestamp: string;
  quantity: number;
}

export interface Anomaly {
  type: 'unknown_location' | 'coordinate_conflict';
  row?: number;
  locationIds: string[];
  message: string;
}

export interface CameraBookmark {
  id: string;
  name: string;
  position: [number, number, number];
  target: [number, number, number];
}

export interface ThresholdConfig {
  low: number;
  medium: number;
  high: number;
}

export interface FilterState {
  dateRange: { start: string; end: string } | null;
  zones: string[];
}

export interface LayoutData {
  locations: Location[];
}

export interface PicksData {
  records: PickRecord[];
}

export interface ImportConflict {
  row: number;
  coordinateKey: string;
  rejectedIds: string[];
  message: string;
}

export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
}

export type ImportWarningType =
  | 'unknown_bookmark'
  | 'duplicate_bookmark_name'
  | 'missing_field'
  | 'unknown_field'
  | 'version_mismatch'
  | 'bookmark_not_found';

export interface ImportWarning {
  type: ImportWarningType;
  message: string;
  details?: Record<string, unknown>;
}

export interface SnapshotData {
  version: 2;
  exportedAt: string;
  anomalies: Anomaly[];
  importConflicts: ImportConflict[];
  filter: FilterState;
  thresholds: ThresholdConfig;
  cameraState: CameraState;
  confirmedCameraState: CameraState | null;
  activeBookmarkId: string | null;
  activeBookmarkName: string | null;
  locations: Location[];
  pickRecords: PickRecord[];
  cameraBookmarks: CameraBookmark[];
}

export interface ImportResult {
  success: boolean;
  error?: string;
  warnings: ImportWarning[];
  restored: {
    cameraState: boolean;
    confirmedCameraState: boolean;
    activeBookmark: boolean;
    activeBookmarkName: boolean;
    cameraBookmarks: boolean;
    locations: boolean;
    pickRecords: boolean;
    filter: boolean;
    thresholds: boolean;
  };
}

export interface DemoPreset {
  id: string;
  name: string;
  description: string;
  snapshot: SnapshotData;
}

export type PlaybackLogLevel = 'info' | 'warning' | 'error' | 'success';

export interface PlaybackLogEntry {
  id: string;
  timestamp: string;
  level: PlaybackLogLevel;
  message: string;
  details?: Record<string, unknown>;
}

export interface PlaybackState {
  activePresetId: string | null;
  lastSnapshotFileName: string | null;
  logs: PlaybackLogEntry[];
}

export type SnapshotSource = 'export' | 'import' | 'auto-save' | 'preset' | 'manual';

export interface SnapshotArchiveEntry {
  id: string;
  fileName: string;
  savedAt: string;
  source: SnapshotSource;
  schemaVersion: number;
  summary: {
    locationsCount: number;
    pickRecordsCount: number;
    bookmarksCount: number;
    activeBookmarkName: string | null;
    zones: string[];
    hasDateFilter: boolean;
    heatmapLevel: 'none' | 'low' | 'medium' | 'high' | 'mixed';
  };
  snapshot: SnapshotData;
  importLogs?: PlaybackLogEntry[];
}

export interface ArchiveImportResult extends ImportResult {
  archiveEntryId: string | null;
  previousStateId: string | null;
  canUndo: boolean;
}

export interface SnapshotArchiveState {
  entries: SnapshotArchiveEntry[];
  maxEntries: number;
  lastAutoSaveId: string | null;
  undoStack: Array<{
    stateId: string;
    snapshot: SnapshotArchiveEntry;
    createdAt: string;
  }>;
  currentImportSession: {
    previousEntryId: string | null;
    importLogs: PlaybackLogEntry[];
  } | null;
}

export type BatchPriority = 'critical' | 'high' | 'medium' | 'low';

export interface BatchLocation {
  locationId: string;
  currentStock: number;
  targetStock: number;
  shortage: number;
  heatLevel: number;
}

export interface ReplenishmentBatch {
  id: string;
  batchNo: string;
  name: string;
  priority: BatchPriority;
  status: 'draft' | 'pending' | 'processing' | 'completed';
  createdAt: string;
  updatedAt: string;
  estimatedOrder: number;
  locations: BatchLocation[];
  totalShortage: number;
  notes?: string;
}

export interface ReplenishmentDraft {
  version: 1;
  savedAt: string;
  batches: ReplenishmentBatch[];
  nextBatchNo: number;
}

export type ReplenishmentConflictType =
  | 'duplicate_batch_no'
  | 'location_occupied'
  | 'missing_required_field'
  | 'unknown_location'
  | 'version_mismatch';

export interface ReplenishmentConflict {
  type: ReplenishmentConflictType;
  message: string;
  details?: Record<string, unknown>;
  batchNo?: string;
  locationId?: string;
  resolved?: boolean;
  resolution?: 'skip' | 'rename' | 'overwrite' | 'merge';
}

export interface ReplenishmentImportResult {
  success: boolean;
  importedBatches: number;
  skippedBatches: number;
  conflicts: ReplenishmentConflict[];
  warnings: string[];
  canUndo: boolean;
  actionId?: string;
}

export interface ReplenishmentActionRecord {
  id: string;
  timestamp: string;
  action: 'create' | 'update' | 'delete' | 'adjust_order' | 'import' | 'merge' | 'split';
  description: string;
  details?: Record<string, unknown>;
  previousState?: ReplenishmentBatch[];
}

export interface SelectionBox {
  zone?: string;
  minRow?: number;
  maxRow?: number;
  minCol?: number;
  maxCol?: number;
  minLayer?: number;
  maxLayer?: number;
  minHeat?: number;
}

export interface ReplenishmentSandboxState {
  batches: ReplenishmentBatch[];
  selectedLocationIds: string[];
  selectionMode: boolean;
  selectionBox: SelectionBox | null;
  activeBatchId: string | null;
  conflicts: ReplenishmentConflict[];
  actionLogs: ReplenishmentActionRecord[];
  undoStack: Array<{
    actionId: string;
    batches: ReplenishmentBatch[];
    timestamp: string;
    description: string;
  }>;
  nextBatchNo: number;
  autoSaveEnabled: boolean;
  lastAutoSavedAt: string | null;
  importSession: {
    previousBatches: ReplenishmentBatch[];
    actionId: string;
  } | null;
}

export interface ReplenishmentExportData {
  version: 1;
  exportedAt: string;
  batches: ReplenishmentBatch[];
  summary: {
    totalBatches: number;
    totalLocations: number;
    totalShortage: number;
    priorityBreakdown: Record<BatchPriority, number>;
  };
}
