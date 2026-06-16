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
