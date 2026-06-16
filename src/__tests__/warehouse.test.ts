import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWarehouseStore } from '@/store/warehouseStore';
import type { Location, PickRecord, SnapshotData, ImportWarningType } from '@/types/warehouse';

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

function resetStore() {
  useWarehouseStore.setState({
    locations: [],
    pickRecords: [],
    anomalies: [],
    importConflicts: [],
    filter: { dateRange: null, zones: [] },
    thresholds: { low: 25, medium: 50, high: 75 },
    cameraState: { position: [22, 16, 24], target: [7.5, 4.5, 7.5] },
    confirmedCameraState: null,
    cameraBookmarks: [],
    activeBookmark: null,
    activeBookmarkName: null,
    importWarnings: [],
  });
}

describe('快照导出与回放', () => {
  beforeEach(() => {
    resetStore();
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
    useWarehouseStore.getState().confirmCameraState();
    useWarehouseStore.getState().addBookmark({
      id: 'bm-test',
      name: '测试视角',
      position: [10, 5, 10],
      target: [3, 1, 3],
    });
    useWarehouseStore.getState().setActiveBookmark('bm-test');

    const beforeState = useWarehouseStore.getState();

    const snapshot: SnapshotData = {
      version: 2,
      exportedAt: new Date().toISOString(),
      anomalies: beforeState.anomalies,
      importConflicts: beforeState.importConflicts,
      filter: beforeState.filter,
      thresholds: beforeState.thresholds,
      cameraState: beforeState.cameraState,
      confirmedCameraState: beforeState.confirmedCameraState,
      activeBookmarkId: beforeState.activeBookmark,
      activeBookmarkName: beforeState.activeBookmarkName,
      locations: beforeState.locations,
      pickRecords: beforeState.pickRecords,
      cameraBookmarks: beforeState.cameraBookmarks,
    };

    resetStore();

    const result = useWarehouseStore.getState().importSnapshot(snapshot);
    expect(result.success).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(result.restored.activeBookmark).toBe(true);
    expect(result.restored.confirmedCameraState).toBe(true);

    const afterState = useWarehouseStore.getState();
    expect(afterState.locations).toEqual(beforeState.locations);
    expect(afterState.pickRecords).toEqual(beforeState.pickRecords);
    expect(afterState.filter).toEqual(beforeState.filter);
    expect(afterState.thresholds).toEqual(beforeState.thresholds);
    expect(afterState.cameraState).toEqual(beforeState.cameraState);
    expect(afterState.confirmedCameraState).toEqual(beforeState.confirmedCameraState);
    expect(afterState.cameraBookmarks).toEqual(beforeState.cameraBookmarks);
    expect(afterState.activeBookmark).toBe('bm-test');
    expect(afterState.activeBookmarkName).toBe('测试视角');
  });

  it('快照中含冲突货位时导入应自动过滤并记录冲突', () => {
    const snapshot: SnapshotData = {
      version: 2,
      exportedAt: new Date().toISOString(),
      anomalies: [],
      importConflicts: [],
      filter: { dateRange: null, zones: [] },
      thresholds: { low: 25, medium: 50, high: 75 },
      cameraState: { position: [22, 16, 24], target: [7.5, 4.5, 7.5] },
      confirmedCameraState: null,
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

  it('不支持的快照版本应以兼容模式导入并产生警告', () => {
    const snapshot = {
      version: 99,
      exportedAt: new Date().toISOString(),
      anomalies: [],
      importConflicts: [],
      filter: { dateRange: null, zones: [] },
      thresholds: { low: 25, medium: 50, high: 75 },
      cameraState: { position: [22, 16, 24] as [number, number, number], target: [7.5, 4.5, 7.5] as [number, number, number] },
      confirmedCameraState: null,
      activeBookmarkId: null,
      activeBookmarkName: null,
      locations: [makeLoc('V-01', 'A', 1, 1, 1)] as Location[],
      pickRecords: [] as PickRecord[],
      cameraBookmarks: [],
    };

    const result = useWarehouseStore.getState().importSnapshot(snapshot as unknown as SnapshotData);
    expect(result.success).toBe(true);
    expect(result.warnings.some((w) => w.type === 'version_mismatch')).toBe(true);
    expect(result.restored.locations).toBe(true);

    const state = useWarehouseStore.getState();
    expect(state.locations).toHaveLength(1);
  });

  it('缺少必要字段的快照应产生警告但尽量恢复可用状态', () => {
    const snapshot = {
      version: 2,
      exportedAt: new Date().toISOString(),
      locations: [makeLoc('V-01', 'A', 1, 1, 1)],
      pickRecords: [],
    } as unknown as SnapshotData;

    const result = useWarehouseStore.getState().importSnapshot(snapshot);
    expect(result.success).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.type === 'missing_field')).toBe(true);
    expect(result.restored.cameraState).toBe(true);

    const state = useWarehouseStore.getState();
    expect(state.locations).toHaveLength(1);
    expect(state.cameraState).toEqual({ position: [22, 16, 24], target: [7.5, 4.5, 7.5] });
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
      version: 2,
      exportedAt: new Date().toISOString(),
      anomalies: beforeState.anomalies,
      importConflicts: beforeState.importConflicts,
      filter: beforeState.filter,
      thresholds: beforeState.thresholds,
      cameraState: beforeState.cameraState,
      confirmedCameraState: beforeState.confirmedCameraState,
      activeBookmarkId: beforeState.activeBookmark,
      activeBookmarkName: beforeState.activeBookmarkName,
      locations: beforeState.locations,
      pickRecords: beforeState.pickRecords,
      cameraBookmarks: beforeState.cameraBookmarks,
    };

    resetStore();

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

describe('视角快照完整链路', () => {
  beforeEach(() => {
    resetStore();
  });

  it('自造快照导入恢复: 完整快照应恢复所有状态包括当前书签', () => {
    const customSnapshot = {
      version: 2,
      exportedAt: '2024-06-15T10:00:00Z',
      anomalies: [],
      importConflicts: [],
      filter: { dateRange: { start: '2024-01-01', end: '2024-06-30' }, zones: ['A', 'B'] },
      thresholds: { low: 30, medium: 60, high: 90 },
      cameraState: { position: [15, 10, 15], target: [5, 3, 5] },
      confirmedCameraState: { position: [15, 10, 15], target: [5, 3, 5] },
      activeBookmarkId: 'bm-overview',
      activeBookmarkName: '仓库概览',
      locations: [
        makeLoc('L-001', 'A', 1, 1, 1),
        makeLoc('L-002', 'B', 1, 1, 1),
      ],
      pickRecords: [
        { locationId: 'L-001', timestamp: '2024-06-10T08:00:00Z', quantity: 25 },
      ],
      cameraBookmarks: [
        { id: 'bm-overview', name: '仓库概览', position: [15, 10, 15], target: [5, 3, 5] },
        { id: 'bm-detail', name: 'A区详情', position: [8, 5, 8], target: [1, 1, 1] },
      ],
    };

    const result = useWarehouseStore.getState().importSnapshot(customSnapshot);

    expect(result.success).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(result.restored.activeBookmark).toBe(true);
    expect(result.restored.confirmedCameraState).toBe(true);
    expect(result.restored.cameraBookmarks).toBe(true);

    const state = useWarehouseStore.getState();
    expect(state.activeBookmark).toBe('bm-overview');
    expect(state.activeBookmarkName).toBe('仓库概览');
    expect(state.confirmedCameraState).toEqual({ position: [15, 10, 15], target: [5, 3, 5] });
    expect(state.cameraBookmarks).toHaveLength(2);
    expect(state.filter.zones).toEqual(['A', 'B']);
  });

  it('模拟重启: activeBookmark 持久化后再加载应保持选中状态', () => {
    useWarehouseStore.setState({
      cameraBookmarks: [
        { id: 'bm-1', name: '视角1', position: [10, 5, 10], target: [3, 1, 3] },
        { id: 'bm-2', name: '视角2', position: [20, 10, 20], target: [7, 4, 7] },
      ],
      activeBookmark: 'bm-2',
      activeBookmarkName: '视角2',
      confirmedCameraState: { position: [20, 10, 20], target: [7, 4, 7] },
    });

    const partialize = (useWarehouseStore as any).persist?.options?.partialize;
    if (partialize) {
      const state = useWarehouseStore.getState();
      const persisted = partialize(state);

      expect(persisted.activeBookmark).toBe('bm-2');
      expect(persisted.activeBookmarkName).toBe('视角2');
      expect(persisted.confirmedCameraState).toEqual({ position: [20, 10, 20], target: [7, 4, 7] });
      expect(persisted.cameraBookmarks).toHaveLength(2);

      const onRehydrate = (useWarehouseStore as any).persist?.options?.onRehydrateStorage;
      if (onRehydrate) {
        const rehydrateFn = onRehydrate();
        const rehydratedState = { ...persisted };
        rehydrateFn(rehydratedState);

        expect(rehydratedState.activeBookmark).toBe('bm-2');
        expect(rehydratedState.activeBookmarkName).toBe('视角2');
      }
    }
  });

  it('模拟重启: activeBookmark 引用不存在的书签应被清除', () => {
    const partialize = (useWarehouseStore as any).persist?.options?.partialize;
    const onRehydrate = (useWarehouseStore as any).persist?.options?.onRehydrateStorage;

    if (partialize && onRehydrate) {
      const persisted = {
        cameraBookmarks: [{ id: 'bm-1', name: '视角1', position: [10, 5, 10], target: [3, 1, 3] }],
        activeBookmark: 'bm-nonexistent',
        activeBookmarkName: '不存在的视角',
      };

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const rehydrateFn = onRehydrate();
      rehydrateFn(persisted);
      consoleWarnSpy.mockRestore();

      expect(persisted.activeBookmark).toBeNull();
      expect(persisted.activeBookmarkName).toBeNull();
    }
  });

  it('快照引用不存在的书签: 应产生警告并清除 activeBookmark', () => {
    const badSnapshot = {
      version: 2,
      exportedAt: '2024-06-15T10:00:00Z',
      anomalies: [],
      importConflicts: [],
      filter: { dateRange: null, zones: [] },
      thresholds: { low: 25, medium: 50, high: 75 },
      cameraState: { position: [10, 5, 10], target: [3, 1, 3] },
      confirmedCameraState: null,
      activeBookmarkId: 'bm-ghost',
      activeBookmarkName: '幽灵书签',
      locations: [makeLoc('L-001', 'A', 1, 1, 1)],
      pickRecords: [],
      cameraBookmarks: [
        { id: 'bm-real', name: '真实书签', position: [10, 5, 10], target: [3, 1, 3] },
      ],
    };

    const result = useWarehouseStore.getState().importSnapshot(badSnapshot);

    expect(result.success).toBe(true);
    const bookmarkNotFound = result.warnings.find((w) => w.type === 'bookmark_not_found');
    expect(bookmarkNotFound).toBeDefined();
    expect(bookmarkNotFound!.message).toContain('bm-ghost');
    expect(result.restored.activeBookmark).toBe(false);

    const state = useWarehouseStore.getState();
    expect(state.activeBookmark).toBeNull();
    expect(state.activeBookmarkName).toBeNull();
    expect(state.locations).toHaveLength(1);
    expect(state.cameraBookmarks).toHaveLength(1);
  });

  it('书签重名: 应自动重命名并产生警告', () => {
    const dupSnapshot = {
      version: 2,
      exportedAt: '2024-06-15T10:00:00Z',
      anomalies: [],
      importConflicts: [],
      filter: { dateRange: null, zones: [] },
      thresholds: { low: 25, medium: 50, high: 75 },
      cameraState: { position: [10, 5, 10], target: [3, 1, 3] },
      confirmedCameraState: null,
      activeBookmarkId: 'bm-1',
      activeBookmarkName: '默认视角',
      locations: [],
      pickRecords: [],
      cameraBookmarks: [
        { id: 'bm-1', name: '默认视角', position: [10, 5, 10], target: [3, 1, 3] },
        { id: 'bm-2', name: '默认视角', position: [20, 10, 20], target: [7, 4, 7] },
        { id: 'bm-3', name: '默认视角', position: [15, 8, 15], target: [5, 2, 5] },
      ],
    };

    const result = useWarehouseStore.getState().importSnapshot(dupSnapshot);

    expect(result.success).toBe(true);
    const dupWarnings = result.warnings.filter((w) => w.type === 'duplicate_bookmark_name');
    expect(dupWarnings.length).toBeGreaterThanOrEqual(2);

    const state = useWarehouseStore.getState();
    const names = state.cameraBookmarks.map((b) => b.name);
    expect(names).toContain('默认视角');
    expect(names).toContain('默认视角 (2)');
    expect(names).toContain('默认视角 (3)');
    expect(new Set(names).size).toBe(3);

    const bm1 = state.cameraBookmarks.find((b) => b.id === 'bm-1');
    expect(bm1?.name).toBe('默认视角');
    expect(state.activeBookmarkName).toBe('默认视角');
  });

  it('旧快照缺字段: 缺 confirmedCameraState 应降级但其余状态可用', () => {
    const oldSnapshot = {
      version: 1,
      exportedAt: '2024-01-01T00:00:00Z',
      anomalies: [],
      importConflicts: [],
      filter: { dateRange: null, zones: ['A'] },
      thresholds: { low: 25, medium: 50, high: 75 },
      cameraState: { position: [10, 5, 10], target: [3, 1, 3] },
      activeBookmarkId: 'bm-old',
      activeBookmarkName: null,
      locations: [makeLoc('OLD-001', 'A', 1, 1, 1)],
      pickRecords: [{ locationId: 'OLD-001', timestamp: '2024-01-01T00:00:00Z', quantity: 5 }],
      cameraBookmarks: [
        { id: 'bm-old', name: '旧版书签', position: [10, 5, 10], target: [3, 1, 3] },
      ],
    };

    const result = useWarehouseStore.getState().importSnapshot(oldSnapshot as unknown as SnapshotData);

    expect(result.success).toBe(true);
    expect(result.restored.confirmedCameraState).toBe(false);
    expect(result.restored.activeBookmark).toBe(true);
    expect(result.restored.locations).toBe(true);

    const state = useWarehouseStore.getState();
    expect(state.confirmedCameraState).toBeNull();
    expect(state.activeBookmark).toBe('bm-old');
    expect(state.activeBookmarkName).toBe('旧版书签');
    expect(state.locations).toHaveLength(1);
    expect(state.filter.zones).toEqual(['A']);
  });

  it('快照带未知字段: 应忽略并产生警告，其余状态仍可用', () => {
    const weirdSnapshot = {
      version: 2,
      exportedAt: '2024-06-15T10:00:00Z',
      anomalies: [],
      importConflicts: [],
      filter: { dateRange: null, zones: [] },
      thresholds: { low: 25, medium: 50, high: 75 },
      cameraState: { position: [10, 5, 10], target: [3, 1, 3] },
      confirmedCameraState: { position: [10, 5, 10], target: [3, 1, 3] },
      activeBookmarkId: 'bm-ok',
      activeBookmarkName: '正常书签',
      locations: [makeLoc('OK-001', 'A', 1, 1, 1)],
      pickRecords: [],
      cameraBookmarks: [
        { id: 'bm-ok', name: '正常书签', position: [10, 5, 10], target: [3, 1, 3] },
      ],
      unknownField1: 'should be ignored',
      unknownField2: { nested: true },
      randomData: [1, 2, 3],
    };

    const result = useWarehouseStore.getState().importSnapshot(weirdSnapshot as unknown as SnapshotData);

    expect(result.success).toBe(true);
    const unknownWarnings = result.warnings.filter((w) => w.type === 'unknown_field');
    expect(unknownWarnings.length).toBe(3);
    expect(unknownWarnings.some((w) => w.details?.field === 'unknownField1')).toBe(true);
    expect(unknownWarnings.some((w) => w.details?.field === 'unknownField2')).toBe(true);
    expect(unknownWarnings.some((w) => w.details?.field === 'randomData')).toBe(true);

    expect(result.restored.activeBookmark).toBe(true);
    expect(result.restored.confirmedCameraState).toBe(true);
    expect(result.restored.locations).toBe(true);

    const state = useWarehouseStore.getState();
    expect(state.activeBookmark).toBe('bm-ok');
    expect(state.locations).toHaveLength(1);
    expect(state.confirmedCameraState).toEqual({ position: [10, 5, 10], target: [3, 1, 3] });
  });

  it('快照中 activeBookmarkName 与实际不一致: 应以实际书签名称为准', () => {
    const mismatchSnapshot = {
      version: 2,
      exportedAt: '2024-06-15T10:00:00Z',
      anomalies: [],
      importConflicts: [],
      filter: { dateRange: null, zones: [] },
      thresholds: { low: 25, medium: 50, high: 75 },
      cameraState: { position: [10, 5, 10], target: [3, 1, 3] },
      confirmedCameraState: null,
      activeBookmarkId: 'bm-real',
      activeBookmarkName: '错误的名称',
      locations: [makeLoc('L-001', 'A', 1, 1, 1)],
      pickRecords: [],
      cameraBookmarks: [
        { id: 'bm-real', name: '正确的名称', position: [10, 5, 10], target: [3, 1, 3] },
      ],
    };

    const result = useWarehouseStore.getState().importSnapshot(mismatchSnapshot);

    expect(result.success).toBe(true);
    const nameMismatch = result.warnings.find((w) =>
      w.type === 'duplicate_bookmark_name' && w.message.includes('不一致')
    );
    expect(nameMismatch).toBeDefined();

    const state = useWarehouseStore.getState();
    expect(state.activeBookmarkName).toBe('正确的名称');
  });

  it('导入结果应包含清晰的 restored 状态标志', () => {
    const fullSnapshot = {
      version: 2,
      exportedAt: '2024-06-15T10:00:00Z',
      anomalies: [],
      importConflicts: [],
      filter: { dateRange: { start: '2024-01-01', end: '2024-12-31' }, zones: ['A'] },
      thresholds: { low: 20, medium: 40, high: 80 },
      cameraState: { position: [10, 5, 10], target: [3, 1, 3] },
      confirmedCameraState: { position: [10, 5, 10], target: [3, 1, 3] },
      activeBookmarkId: 'bm-1',
      activeBookmarkName: '书签1',
      locations: [makeLoc('L-001', 'A', 1, 1, 1)],
      pickRecords: [{ locationId: 'L-001', timestamp: '2024-06-01T00:00:00Z', quantity: 10 }],
      cameraBookmarks: [
        { id: 'bm-1', name: '书签1', position: [10, 5, 10], target: [3, 1, 3] },
      ],
    };

    const result = useWarehouseStore.getState().importSnapshot(fullSnapshot);

    expect(result.success).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(result.restored).toEqual({
      cameraState: true,
      confirmedCameraState: true,
      activeBookmark: true,
      activeBookmarkName: true,
      cameraBookmarks: true,
      locations: true,
      pickRecords: true,
      filter: true,
      thresholds: true,
    });
  });

  it('confirmCameraState 应保存当前 cameraState 为确认状态', () => {
    useWarehouseStore.getState().setCameraState({
      position: [5, 5, 5],
      target: [1, 1, 1],
    });

    expect(useWarehouseStore.getState().confirmedCameraState).toBeNull();

    useWarehouseStore.getState().confirmCameraState();

    expect(useWarehouseStore.getState().confirmedCameraState).toEqual({
      position: [5, 5, 5],
      target: [1, 1, 1],
    });

    useWarehouseStore.getState().setCameraState({
      position: [10, 10, 10],
      target: [2, 2, 2],
    });

    expect(useWarehouseStore.getState().confirmedCameraState).toEqual({
      position: [5, 5, 5],
      target: [1, 1, 1],
    });
  });

  it('导入警告应存入 store 并可被清除', () => {
    const badSnapshot = {
      version: 999,
      exportedAt: '2024-06-15T10:00:00Z',
      locations: [makeLoc('L-001', 'A', 1, 1, 1)],
      pickRecords: [],
      unknownField: 'oops',
    };

    const result = useWarehouseStore.getState().importSnapshot(badSnapshot as unknown as SnapshotData);

    expect(result.success).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);

    const state = useWarehouseStore.getState();
    expect(state.importWarnings).toEqual(result.warnings);

    useWarehouseStore.getState().clearImportWarnings();

    expect(useWarehouseStore.getState().importWarnings).toHaveLength(0);
  });

  it('空 activeBookmarkId 导入后应保持为 null', () => {
    const snapshot: SnapshotData = {
      version: 2,
      exportedAt: '2024-06-15T10:00:00Z',
      anomalies: [],
      importConflicts: [],
      filter: { dateRange: null, zones: [] },
      thresholds: { low: 25, medium: 50, high: 75 },
      cameraState: { position: [10, 5, 10], target: [3, 1, 3] },
      confirmedCameraState: null,
      activeBookmarkId: null,
      activeBookmarkName: null,
      locations: [makeLoc('L-001', 'A', 1, 1, 1)],
      pickRecords: [],
      cameraBookmarks: [
        { id: 'bm-1', name: '书签1', position: [10, 5, 10], target: [3, 1, 3] },
      ],
    };

    const result = useWarehouseStore.getState().importSnapshot(snapshot);

    expect(result.success).toBe(true);
    expect(result.restored.activeBookmark).toBe(false);

    const state = useWarehouseStore.getState();
    expect(state.activeBookmark).toBeNull();
    expect(state.activeBookmarkName).toBeNull();
  });
});
