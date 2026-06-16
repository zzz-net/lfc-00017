import { describe, it, expect, beforeEach } from 'vitest';
import { useWarehouseStore } from '@/store/warehouseStore';
import type { Location, PickRecord, SnapshotData } from '@/types/warehouse';

function makeLoc(id: string, zone: string, row: number, col: number, layer: number): Location {
  return { id, zone, row, col, layer, x: col * 3, y: 0, z: zone === 'C' ? 15 : 0 };
}

describe('布局导入: 重复坐标冲突', () => {
  beforeEach(() => {
    useWarehouseStore.setState({
      locations: [],
      pickRecords: [],
      anomalies: [],
      importConflicts: [],
      filter: { dateRange: null, zones: [] },
      thresholds: { low: 25, medium: 50, high: 75 },
    });
  });

  it('相同坐标的货位应全部被拒绝，不存入 locations', () => {
    const locs = [
      makeLoc('X-01', 'A', 1, 1, 1),
      makeLoc('X-02', 'A', 1, 1, 1),
      makeLoc('X-03', 'A', 1, 1, 1),
    ];

    const conflicts = useWarehouseStore.getState().setLocations(locs);

    const state = useWarehouseStore.getState();
    expect(state.locations).toHaveLength(0);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].row).toBe(1);
    expect(conflicts[0].rejectedIds).toEqual(['X-01', 'X-02', 'X-03']);
    expect(state.importConflicts).toHaveLength(1);
  });

  it('冲突行和有效行应分开处理: 有效行保留，冲突行拒绝', () => {
    const locs = [
      makeLoc('A-01', 'A', 1, 1, 1),
      makeLoc('A-02', 'A', 2, 1, 1),
      makeLoc('A-02-DUP', 'A', 2, 1, 1),
      makeLoc('A-03', 'A', 3, 1, 1),
    ];

    const conflicts = useWarehouseStore.getState().setLocations(locs);

    const state = useWarehouseStore.getState();
    expect(state.locations).toHaveLength(2);
    expect(state.locations.map((l) => l.id)).toEqual(['A-01', 'A-03']);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].row).toBe(2);
    expect(conflicts[0].rejectedIds).toEqual(['A-02', 'A-02-DUP']);
  });

  it('多行各自冲突时按行逐条报告', () => {
    const locs = [
      makeLoc('R1-A', 'A', 1, 1, 1),
      makeLoc('R1-B', 'A', 1, 1, 1),
      makeLoc('R2-A', 'A', 2, 1, 1),
      makeLoc('R2-B', 'A', 2, 1, 1),
      makeLoc('R2-C', 'A', 2, 1, 1),
      makeLoc('R3', 'A', 3, 1, 1),
    ];

    const conflicts = useWarehouseStore.getState().setLocations(locs);
    expect(conflicts).toHaveLength(2);
    expect(conflicts.find((c) => c.row === 1)).toBeDefined();
    expect(conflicts.find((c) => c.row === 2)).toBeDefined();
    expect(conflicts.find((c) => c.row === 2)!.rejectedIds).toHaveLength(3);

    const state = useWarehouseStore.getState();
    expect(state.locations).toHaveLength(1);
    expect(state.locations[0].id).toBe('R3');
  });

  it('heatmap 不包含任何被拒绝的冲突货位', () => {
    const locs = [
      makeLoc('V-01', 'A', 1, 1, 1),
      makeLoc('D-01', 'A', 2, 1, 1),
      makeLoc('D-02', 'A', 2, 1, 1),
    ];
    const picks: PickRecord[] = [
      { locationId: 'V-01', timestamp: '2024-03-01T08:00:00Z', quantity: 10 },
      { locationId: 'D-01', timestamp: '2024-03-01T08:00:00Z', quantity: 5 },
    ];

    useWarehouseStore.getState().setLocations(locs);
    useWarehouseStore.getState().setPickRecords(picks);

    const heatMap = useWarehouseStore.getState().getHeatMap();
    expect(heatMap.has('V-01')).toBe(true);
    expect(heatMap.has('D-01')).toBe(false);
    expect(heatMap.has('D-02')).toBe(false);
  });
});

describe('未知货位拣货记录', () => {
  beforeEach(() => {
    useWarehouseStore.setState({
      locations: [],
      pickRecords: [],
      anomalies: [],
      importConflicts: [],
    });
  });

  it('拣货记录引用不存在的货位应产生 unknown_location 异常', () => {
    const locs = [makeLoc('A-01', 'A', 1, 1, 1)];
    const picks: PickRecord[] = [
      { locationId: 'A-01', timestamp: '2024-03-01T08:00:00Z', quantity: 10 },
      { locationId: 'GHOST-01', timestamp: '2024-03-02T08:00:00Z', quantity: 5 },
      { locationId: 'GHOST-02', timestamp: '2024-03-03T08:00:00Z', quantity: 3 },
    ];

    useWarehouseStore.getState().setLocations(locs);
    useWarehouseStore.getState().setPickRecords(picks);

    const state = useWarehouseStore.getState();
    const unknowns = state.anomalies.filter((a) => a.type === 'unknown_location');
    expect(unknowns).toHaveLength(2);
    expect(unknowns.some((a) => a.locationIds.includes('GHOST-01'))).toBe(true);
    expect(unknowns.some((a) => a.locationIds.includes('GHOST-02'))).toBe(true);
  });

  it('冲突货位被拒绝后，其拣货记录应被视为未知货位', () => {
    const locs = [
      makeLoc('D-01', 'A', 1, 1, 1),
      makeLoc('D-01-DUP', 'A', 1, 1, 1),
      makeLoc('V-01', 'A', 2, 1, 1),
    ];
    const picks: PickRecord[] = [
      { locationId: 'D-01', timestamp: '2024-03-01T08:00:00Z', quantity: 5 },
      { locationId: 'D-01-DUP', timestamp: '2024-03-02T08:00:00Z', quantity: 3 },
      { locationId: 'V-01', timestamp: '2024-03-03T08:00:00Z', quantity: 10 },
    ];

    useWarehouseStore.getState().setLocations(locs);
    useWarehouseStore.getState().setPickRecords(picks);

    const state = useWarehouseStore.getState();
    expect(state.locations).toHaveLength(1);
    expect(state.locations[0].id).toBe('V-01');

    const unknowns = state.anomalies.filter((a) => a.type === 'unknown_location');
    expect(unknowns).toHaveLength(2);
    const allIds = unknowns.flatMap((a) => a.locationIds);
    expect(allIds).toContain('D-01');
    expect(allIds).toContain('D-01-DUP');
  });
});

describe('快照导出与回放', () => {
  beforeEach(() => {
    useWarehouseStore.setState({
      locations: [],
      pickRecords: [],
      anomalies: [],
      importConflicts: [],
      filter: { dateRange: null, zones: [] },
      thresholds: { low: 25, medium: 50, high: 75 },
      cameraState: { position: [22, 16, 24], target: [7.5, 4.5, 7.5] },
      cameraBookmarks: [],
      activeBookmark: null,
    });
  });

  it('导出再导入后所有状态应恢复一致', () => {
    const locs = [
      makeLoc('A-01', 'A', 1, 1, 1),
      makeLoc('A-02', 'A', 2, 1, 1),
    ];
    const picks: PickRecord[] = [
      { locationId: 'A-01', timestamp: '2024-03-01T08:00:00Z', quantity: 10 },
    ];

    useWarehouseStore.getState().setLocations(locs);
    useWarehouseStore.getState().setPickRecords(picks);
    useWarehouseStore.getState().setFilter({
      dateRange: { start: '2024-03-01', end: '2024-03-31' },
      zones: ['A'],
    });
    useWarehouseStore.getState().setThresholds({ low: 20, medium: 40, high: 80 });
    useWarehouseStore.getState().setCameraState({
      position: [10, 5, 10],
      target: [3, 1, 3],
    });
    useWarehouseStore.getState().addBookmark({
      id: 'bm-test',
      name: '测试视角',
      position: [10, 5, 10],
      target: [3, 1, 3],
    });

    const beforeState = useWarehouseStore.getState();

    const snapshot: SnapshotData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      anomalies: beforeState.anomalies,
      importConflicts: beforeState.importConflicts,
      filter: beforeState.filter,
      thresholds: beforeState.thresholds,
      cameraState: beforeState.cameraState,
      activeBookmarkId: beforeState.activeBookmark,
      activeBookmarkName: null,
      locations: beforeState.locations,
      pickRecords: beforeState.pickRecords,
      cameraBookmarks: beforeState.cameraBookmarks,
    };

    useWarehouseStore.setState({
      locations: [],
      pickRecords: [],
      anomalies: [],
      importConflicts: [],
      filter: { dateRange: null, zones: [] },
      thresholds: { low: 25, medium: 50, high: 75 },
      cameraState: { position: [22, 16, 24], target: [7.5, 4.5, 7.5] },
      cameraBookmarks: [],
      activeBookmark: null,
    });

    const result = useWarehouseStore.getState().importSnapshot(snapshot);
    expect(result.success).toBe(true);

    const afterState = useWarehouseStore.getState();
    expect(afterState.locations).toEqual(beforeState.locations);
    expect(afterState.pickRecords).toEqual(beforeState.pickRecords);
    expect(afterState.filter).toEqual(beforeState.filter);
    expect(afterState.thresholds).toEqual(beforeState.thresholds);
    expect(afterState.cameraState).toEqual(beforeState.cameraState);
    expect(afterState.cameraBookmarks).toEqual(beforeState.cameraBookmarks);
  });

  it('快照中含冲突货位时导入应自动过滤并记录冲突', () => {
    const snapshot: SnapshotData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      anomalies: [],
      importConflicts: [],
      filter: { dateRange: null, zones: [] },
      thresholds: { low: 25, medium: 50, high: 75 },
      cameraState: { position: [22, 16, 24], target: [7.5, 4.5, 7.5] },
      activeBookmarkId: null,
      activeBookmarkName: null,
      locations: [
        makeLoc('S-01', 'A', 1, 1, 1),
        makeLoc('S-02', 'A', 1, 1, 1),
        makeLoc('S-03', 'A', 2, 1, 1),
      ],
      pickRecords: [],
      cameraBookmarks: [],
    };

    const result = useWarehouseStore.getState().importSnapshot(snapshot);
    expect(result.success).toBe(true);

    const state = useWarehouseStore.getState();
    expect(state.locations).toHaveLength(1);
    expect(state.locations[0].id).toBe('S-03');
    expect(state.importConflicts).toHaveLength(1);
    expect(state.importConflicts[0].rejectedIds).toContain('S-01');
    expect(state.importConflicts[0].rejectedIds).toContain('S-02');
  });

  it('不支持的快照版本应返回失败', () => {
    const snapshot = {
      version: 99,
      exportedAt: new Date().toISOString(),
      anomalies: [],
      importConflicts: [],
      filter: { dateRange: null, zones: [] },
      thresholds: { low: 25, medium: 50, high: 75 },
      cameraState: { position: [22, 16, 24] as [number, number, number], target: [7.5, 4.5, 7.5] as [number, number, number] },
      activeBookmarkId: null,
      activeBookmarkName: null,
      locations: [] as Location[],
      pickRecords: [] as PickRecord[],
      cameraBookmarks: [],
    };

    const result = useWarehouseStore.getState().importSnapshot(snapshot as SnapshotData);
    expect(result.success).toBe(false);
    expect(result.error).toContain('版本');
  });

  it('缺少必要字段的快照应返回失败', () => {
    const snapshot = {
      version: 1,
      exportedAt: new Date().toISOString(),
    } as unknown as SnapshotData;

    const result = useWarehouseStore.getState().importSnapshot(snapshot);
    expect(result.success).toBe(false);
    expect(result.error).toContain('必要字段');
  });

  it('回放后 heatmap 应与导出前一致', () => {
    const locs = [
      makeLoc('H-01', 'A', 1, 1, 1),
      makeLoc('H-02', 'A', 2, 1, 1),
    ];
    const picks: PickRecord[] = [
      { locationId: 'H-01', timestamp: '2024-03-01T08:00:00Z', quantity: 30 },
      { locationId: 'H-02', timestamp: '2024-03-02T08:00:00Z', quantity: 10 },
    ];

    useWarehouseStore.getState().setLocations(locs);
    useWarehouseStore.getState().setPickRecords(picks);
    useWarehouseStore.getState().setThresholds({ low: 30, medium: 60, high: 90 });

    const beforeHeat = useWarehouseStore.getState().getHeatMap();

    const beforeState = useWarehouseStore.getState();
    const snapshot: SnapshotData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      anomalies: beforeState.anomalies,
      importConflicts: beforeState.importConflicts,
      filter: beforeState.filter,
      thresholds: beforeState.thresholds,
      cameraState: beforeState.cameraState,
      activeBookmarkId: beforeState.activeBookmark,
      activeBookmarkName: null,
      locations: beforeState.locations,
      pickRecords: beforeState.pickRecords,
      cameraBookmarks: beforeState.cameraBookmarks,
    };

    useWarehouseStore.setState({
      locations: [],
      pickRecords: [],
      anomalies: [],
      thresholds: { low: 25, medium: 50, high: 75 },
    });

    useWarehouseStore.getState().importSnapshot(snapshot);

    const afterHeat = useWarehouseStore.getState().getHeatMap();
    for (const loc of locs) {
      const before = beforeHeat.get(loc.id);
      const after = afterHeat.get(loc.id);
      expect(before).toBeDefined();
      expect(after).toBeDefined();
      expect(after!.color).toBe(before!.color);
      expect(after!.count).toBe(before!.count);
    }
  });
});
