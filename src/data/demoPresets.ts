import type { DemoPreset, SnapshotData, Location, PickRecord, CameraBookmark } from '@/types/warehouse';

function makeLoc(id: string, zone: string, row: number, col: number, layer: number): Location {
  const xOffset = zone === 'B' ? 12 : 0;
  const zOffset = zone === 'C' ? 15 : 0;
  return {
    id,
    zone,
    row,
    col,
    layer,
    x: xOffset + (col - 1) * 3,
    y: (layer - 1) * 3,
    z: zOffset + (row - 1) * 3,
  };
}

const defaultBookmarks: CameraBookmark[] = [
  {
    id: 'bm-overview',
    name: '全局概览',
    position: [22, 16, 24],
    target: [7.5, 3, 7.5],
  },
  {
    id: 'bm-zone-a',
    name: 'A 区特写',
    position: [8, 8, 12],
    target: [3, 1.5, 4.5],
  },
  {
    id: 'bm-zone-b',
    name: 'B 区特写',
    position: [18, 8, 12],
    target: [13.5, 1.5, 4.5],
  },
  {
    id: 'bm-zone-c',
    name: 'C 区俯视角',
    position: [6, 18, 20],
    target: [3, 0, 16.5],
  },
];

const fullLayoutLocations: Location[] = [
  makeLoc('A-01-01-L1', 'A', 1, 1, 1),
  makeLoc('A-01-01-L2', 'A', 1, 1, 2),
  makeLoc('A-01-02-L1', 'A', 1, 2, 1),
  makeLoc('A-01-02-L2', 'A', 1, 2, 2),
  makeLoc('A-01-03-L1', 'A', 1, 3, 1),
  makeLoc('A-01-03-L2', 'A', 1, 3, 2),
  makeLoc('A-02-01-L1', 'A', 2, 1, 1),
  makeLoc('A-02-01-L2', 'A', 2, 1, 2),
  makeLoc('A-02-02-L1', 'A', 2, 2, 1),
  makeLoc('A-02-02-L2', 'A', 2, 2, 2),
  makeLoc('A-02-03-L1', 'A', 2, 3, 1),
  makeLoc('A-02-03-L2', 'A', 2, 3, 2),
  makeLoc('A-03-01-L1', 'A', 3, 1, 1),
  makeLoc('A-03-01-L2', 'A', 3, 1, 2),
  makeLoc('A-03-02-L1', 'A', 3, 2, 1),
  makeLoc('A-03-02-L2', 'A', 3, 2, 2),
  makeLoc('A-04-01-L1', 'A', 4, 1, 1),
  makeLoc('A-04-01-L2', 'A', 4, 1, 2),
  makeLoc('A-04-02-L1', 'A', 4, 2, 1),
  makeLoc('A-04-02-L2', 'A', 4, 2, 2),

  makeLoc('B-01-01-L1', 'B', 1, 1, 1),
  makeLoc('B-01-01-L2', 'B', 1, 1, 2),
  makeLoc('B-01-02-L1', 'B', 1, 2, 1),
  makeLoc('B-01-02-L2', 'B', 1, 2, 2),
  makeLoc('B-02-01-L1', 'B', 2, 1, 1),
  makeLoc('B-02-01-L2', 'B', 2, 1, 2),
  makeLoc('B-02-02-L1', 'B', 2, 2, 1),
  makeLoc('B-02-02-L2', 'B', 2, 2, 2),
  makeLoc('B-03-01-L1', 'B', 3, 1, 1),
  makeLoc('B-03-01-L2', 'B', 3, 1, 2),
  makeLoc('B-03-02-L1', 'B', 3, 2, 1),
  makeLoc('B-03-02-L2', 'B', 3, 2, 2),

  makeLoc('C-01-01-L1', 'C', 1, 1, 1),
  makeLoc('C-01-01-L2', 'C', 1, 1, 2),
  makeLoc('C-01-02-L1', 'C', 1, 2, 1),
  makeLoc('C-01-02-L2', 'C', 1, 2, 2),
  makeLoc('C-02-01-L1', 'C', 2, 1, 1),
  makeLoc('C-02-01-L2', 'C', 2, 1, 2),
  makeLoc('C-02-02-L1', 'C', 2, 2, 1),
  makeLoc('C-02-02-L2', 'C', 2, 2, 2),
];

const heavyPicks: PickRecord[] = [
  { locationId: 'A-01-01-L1', timestamp: '2024-06-01T08:00:00Z', quantity: 15 },
  { locationId: 'A-01-01-L1', timestamp: '2024-06-05T09:30:00Z', quantity: 22 },
  { locationId: 'A-01-01-L2', timestamp: '2024-06-03T10:00:00Z', quantity: 8 },
  { locationId: 'A-02-02-L1', timestamp: '2024-06-02T11:00:00Z', quantity: 45 },
  { locationId: 'A-02-02-L1', timestamp: '2024-06-08T14:00:00Z', quantity: 38 },
  { locationId: 'A-02-02-L2', timestamp: '2024-06-04T12:00:00Z', quantity: 52 },
  { locationId: 'A-02-02-L2', timestamp: '2024-06-10T08:00:00Z', quantity: 61 },
  { locationId: 'A-03-02-L1', timestamp: '2024-06-06T13:00:00Z', quantity: 33 },
  { locationId: 'A-03-02-L2', timestamp: '2024-06-07T15:00:00Z', quantity: 70 },
  { locationId: 'A-04-01-L1', timestamp: '2024-06-09T16:00:00Z', quantity: 18 },
  { locationId: 'A-04-02-L1', timestamp: '2024-06-11T09:00:00Z', quantity: 27 },

  { locationId: 'B-01-01-L1', timestamp: '2024-06-01T08:30:00Z', quantity: 12 },
  { locationId: 'B-01-02-L1', timestamp: '2024-06-02T09:00:00Z', quantity: 42 },
  { locationId: 'B-01-02-L2', timestamp: '2024-06-03T10:00:00Z', quantity: 55 },
  { locationId: 'B-02-02-L1', timestamp: '2024-06-04T11:00:00Z', quantity: 38 },
  { locationId: 'B-03-01-L1', timestamp: '2024-06-05T12:00:00Z', quantity: 60 },
  { locationId: 'B-03-01-L2', timestamp: '2024-06-06T13:00:00Z', quantity: 48 },
  { locationId: 'B-03-02-L1', timestamp: '2024-06-07T14:00:00Z', quantity: 33 },

  { locationId: 'C-01-01-L1', timestamp: '2024-06-01T08:00:00Z', quantity: 9 },
  { locationId: 'C-01-02-L1', timestamp: '2024-06-02T09:00:00Z', quantity: 40 },
  { locationId: 'C-01-02-L2', timestamp: '2024-06-03T10:00:00Z', quantity: 55 },
  { locationId: 'C-02-01-L1', timestamp: '2024-06-04T11:00:00Z', quantity: 28 },
  { locationId: 'C-02-02-L1', timestamp: '2024-06-05T12:00:00Z', quantity: 33 },
  { locationId: 'C-02-02-L2', timestamp: '2024-06-06T13:00:00Z', quantity: 11 },

  { locationId: 'UNKNOWN-X001', timestamp: '2024-06-08T10:00:00Z', quantity: 5 },
  { locationId: 'UNKNOWN-X002', timestamp: '2024-06-09T11:00:00Z', quantity: 10 },
];

const conflictLocations: Location[] = [
  makeLoc('A-01-01', 'A', 1, 1, 1),
  makeLoc('A-01-01-DUP1', 'A', 1, 1, 1),
  makeLoc('A-01-01-DUP2', 'A', 1, 1, 1),
  makeLoc('A-01-02', 'A', 1, 2, 1),
  makeLoc('A-02-01', 'A', 2, 1, 1),
  makeLoc('A-02-01-DUP', 'A', 2, 1, 1),
  makeLoc('B-01-01', 'B', 1, 1, 1),
  makeLoc('B-01-02', 'B', 1, 2, 1),
  makeLoc('B-02-01', 'B', 2, 1, 1),
];

const conflictPicks: PickRecord[] = [
  { locationId: 'A-01-01', timestamp: '2024-06-01T08:00:00Z', quantity: 20 },
  { locationId: 'A-01-01-DUP1', timestamp: '2024-06-02T09:00:00Z', quantity: 10 },
  { locationId: 'A-01-02', timestamp: '2024-06-03T10:00:00Z', quantity: 35 },
  { locationId: 'A-02-01', timestamp: '2024-06-04T11:00:00Z', quantity: 15 },
  { locationId: 'B-01-01', timestamp: '2024-06-05T12:00:00Z', quantity: 42 },
  { locationId: 'B-01-02', timestamp: '2024-06-06T13:00:00Z', quantity: 28 },
  { locationId: 'GHOST-999', timestamp: '2024-06-07T14:00:00Z', quantity: 5 },
];

const sparsePicks: PickRecord[] = [
  { locationId: 'A-01-01-L1', timestamp: '2024-06-10T08:00:00Z', quantity: 3 },
  { locationId: 'A-02-02-L1', timestamp: '2024-06-11T09:00:00Z', quantity: 7 },
  { locationId: 'B-01-02-L1', timestamp: '2024-06-12T10:00:00Z', quantity: 2 },
  { locationId: 'C-01-01-L1', timestamp: '2024-06-13T11:00:00Z', quantity: 5 },
];

function buildSnapshot(
  locations: Location[],
  pickRecords: PickRecord[],
  overrides: Partial<SnapshotData> = {}
): SnapshotData {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    anomalies: [],
    importConflicts: [],
    filter: { dateRange: null, zones: [] },
    thresholds: { low: 25, medium: 50, high: 75 },
    cameraState: { position: [22, 16, 24], target: [7.5, 3, 7.5] },
    confirmedCameraState: null,
    activeBookmarkId: 'bm-overview',
    activeBookmarkName: '全局概览',
    locations,
    pickRecords,
    cameraBookmarks: defaultBookmarks,
    ...overrides,
  };
}

export const demoPresets: DemoPreset[] = [
  {
    id: 'preset-full-heatmap',
    name: '完整热力图演示',
    description: '三区域双层仓位，含高强度拣货数据、2 条未知货位异常，4 个默认视角书签',
    snapshot: buildSnapshot(fullLayoutLocations, heavyPicks, {
      filter: { dateRange: { start: '2024-06-01', end: '2024-06-15' }, zones: [] },
      thresholds: { low: 20, medium: 45, high: 70 },
      confirmedCameraState: { position: [22, 16, 24], target: [7.5, 3, 7.5] },
    }),
  },
  {
    id: 'preset-conflict-demo',
    name: '冲突与异常演示',
    description: '含坐标冲突货位（2 组 4 个冲突）、未知货位拣货记录，用于验收导入过滤和异常提示',
    snapshot: buildSnapshot(conflictLocations, conflictPicks, {
      activeBookmarkId: 'bm-zone-a',
      activeBookmarkName: 'A 区特写',
      cameraState: defaultBookmarks[1].position
        ? { position: defaultBookmarks[1].position, target: defaultBookmarks[1].target }
        : { position: [22, 16, 24], target: [7.5, 3, 7.5] },
    }),
  },
  {
    id: 'preset-sparse-data',
    name: '稀疏数据演示',
    description: '完整布局但拣货记录少，用于验证低热度色阶显示和空数据回退',
    snapshot: buildSnapshot(fullLayoutLocations, sparsePicks, {
      thresholds: { low: 15, medium: 40, high: 65 },
      activeBookmarkId: 'bm-overview',
      activeBookmarkName: '全局概览',
    }),
  },
];

export function getPresetById(id: string): DemoPreset | undefined {
  return demoPresets.find((p) => p.id === id);
}
