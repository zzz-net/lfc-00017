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
