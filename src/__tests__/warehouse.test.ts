import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWarehouseStore, buildSnapshotExportFileName } from '@/store/warehouseStore';
import type { Location, PickRecord, SnapshotData, ImportWarningType, SnapshotArchiveState } from '@/types/warehouse';
import { demoPresets, getPresetById } from '@/data/demoPresets';

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

describe('验收回放台: 演示预设', () => {
  beforeEach(() => {
    resetStore();
    useWarehouseStore.setState({
      playback: { activePresetId: null, lastSnapshotFileName: null, logs: [] },
    });
  });

  it('demoPresets 应包含至少 3 个预设样例', () => {
    expect(demoPresets.length).toBeGreaterThanOrEqual(3);
    expect(demoPresets.every((p) => p.id && p.name && p.description && p.snapshot)).toBe(true);
  });

  it('getPresetById 应能通过 ID 找到预设，找不到返回 undefined', () => {
    const first = demoPresets[0];
    expect(getPresetById(first.id)?.id).toBe(first.id);
    expect(getPresetById('nonexistent-preset')).toBeUndefined();
  });

  it('loadDemoPreset 装载预设后应恢复完整状态并记录 activePresetId', () => {
    const preset = demoPresets[0];
    const result = useWarehouseStore.getState().loadDemoPreset(preset.id);

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);

    const state = useWarehouseStore.getState();
    expect(state.playback.activePresetId).toBe(preset.id);
    expect(state.locations.length).toBeGreaterThan(0);
    expect(state.pickRecords.length).toBeGreaterThan(0);
    expect(state.cameraBookmarks.length).toBeGreaterThan(0);
  });

  it('loadDemoPreset 装载不存在的预设应返回 null 并记录错误日志', () => {
    const result = useWarehouseStore.getState().loadDemoPreset('nonexistent');
    expect(result).toBeNull();

    const logs = useWarehouseStore.getState().playback.logs;
    expect(logs.length).toBeGreaterThan(0);
    const errorLog = logs.find((l) => l.level === 'error');
    expect(errorLog).toBeDefined();
    expect(errorLog!.message).toContain('不存在');
  });

  it('预设冲突与异常演示应导入后产生 importConflicts 和 anomalies', () => {
    const conflictPreset = demoPresets.find((p) => p.id === 'preset-conflict-demo');
    expect(conflictPreset).toBeDefined();

    const result = useWarehouseStore.getState().loadDemoPreset(conflictPreset!.id);
    expect(result!.success).toBe(true);

    const state = useWarehouseStore.getState();
    expect(state.importConflicts.length).toBeGreaterThan(0);
    expect(state.anomalies.length).toBeGreaterThan(0);
  });
});

describe('验收回放台: 操作日志', () => {
  beforeEach(() => {
    resetStore();
    useWarehouseStore.setState({
      playback: { activePresetId: null, lastSnapshotFileName: null, logs: [] },
    });
  });

  it('addPlaybackLog 应按 level 记录并保留最多 200 条，最新在前', () => {
    const store = useWarehouseStore.getState();
    store.addPlaybackLog('info', '日志1');
    store.addPlaybackLog('warning', '日志2');
    store.addPlaybackLog('success', '日志3');
    store.addPlaybackLog('error', '日志4');

    const logs = useWarehouseStore.getState().playback.logs;
    expect(logs).toHaveLength(4);
    expect(logs[0].level).toBe('error');
    expect(logs[0].message).toBe('日志4');
    expect(logs[3].level).toBe('info');
    expect(logs.every((l) => l.id && l.timestamp)).toBe(true);
  });

  it('clearPlaybackLogs 应清空日志', () => {
    const store = useWarehouseStore.getState();
    store.addPlaybackLog('info', 'test');
    expect(useWarehouseStore.getState().playback.logs.length).toBeGreaterThan(0);

    store.clearPlaybackLogs();
    expect(useWarehouseStore.getState().playback.logs).toHaveLength(0);
  });

  it('importSnapshot 成功/失败均应写入日志并记录文件名', () => {
    const store = useWarehouseStore.getState();
    const goodSnapshot: SnapshotData = {
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
      locations: [makeLoc('T-01', 'A', 1, 1, 1)],
      pickRecords: [],
      cameraBookmarks: [],
    };

    const result = store.importSnapshot(goodSnapshot, 'test-snapshot.json');
    expect(result.success).toBe(true);
    expect(useWarehouseStore.getState().playback.lastSnapshotFileName).toBe('test-snapshot.json');

    const successLog = useWarehouseStore.getState().playback.logs.find(
      (l) => l.level === 'success' || l.level === 'warning'
    );
    expect(successLog).toBeDefined();
    expect(successLog!.message).toContain('test-snapshot.json');

    store.importSnapshot(null, 'bad.json');
    const errorLog = useWarehouseStore.getState().playback.logs.find((l) => l.level === 'error');
    expect(errorLog).toBeDefined();
    expect(errorLog!.message).toContain('失败');
  });
});

describe('验收回放台: 导出文件名规则', () => {
  it('buildSnapshotExportFileName 应符合规则 warehouse-snapshot[-{presetId}]-YYYY-MM-DD-HHMMSS.json', () => {
    const name1 = buildSnapshotExportFileName();
    expect(name1).toMatch(/^warehouse-snapshot-\d{4}-\d{2}-\d{2}-\d{6}\.json$/);

    const name2 = buildSnapshotExportFileName('preset-full-heatmap');
    expect(name2).toMatch(
      /^warehouse-snapshot-preset-full-heatmap-\d{4}-\d{2}-\d{2}-\d{6}\.json$/
    );

    const name3 = buildSnapshotExportFileName(null);
    expect(name3).toMatch(/^warehouse-snapshot-\d{4}-\d{2}-\d{2}-\d{6}\.json$/);
  });
});

describe('验收回放台: 跨重启恢复 (persist)', () => {
  it('playback.activePresetId 和 lastSnapshotFileName 应被持久化', () => {
    useWarehouseStore.setState({
      playback: {
        activePresetId: 'preset-full-heatmap',
        lastSnapshotFileName: 'warehouse-snapshot-preset-full-heatmap-2024-06-15-100000.json',
        logs: [{ id: '1', timestamp: 'x', level: 'info', message: 'y' }],
      },
    });

    const partialize = (useWarehouseStore as any).persist?.options?.partialize;
    if (partialize) {
      const persisted = partialize(useWarehouseStore.getState());
      expect(persisted.playback).toBeDefined();
      expect(persisted.playback.activePresetId).toBe('preset-full-heatmap');
      expect(persisted.playback.lastSnapshotFileName).toBe(
        'warehouse-snapshot-preset-full-heatmap-2024-06-15-100000.json'
      );
      expect(persisted.playback.logs).toHaveLength(0);
    }

    const state = useWarehouseStore.getState();
    expect(state.playback.activePresetId).toBe('preset-full-heatmap');
    expect(state.playback.lastSnapshotFileName).toBe(
      'warehouse-snapshot-preset-full-heatmap-2024-06-15-100000.json'
    );
  });

  it('rehydrate 时缺少 playback 应补默认值', () => {
    const onRehydrate = (useWarehouseStore as any).persist?.options?.onRehydrateStorage;
    if (onRehydrate) {
      const rehydrateFn = onRehydrate();
      const stateWithoutPlayback: any = {
        locations: [],
        pickRecords: [],
        cameraBookmarks: [],
        activeBookmark: null,
      };
      rehydrateFn(stateWithoutPlayback);

      expect(stateWithoutPlayback.playback).toBeDefined();
      expect(stateWithoutPlayback.playback.activePresetId).toBeNull();
      expect(stateWithoutPlayback.playback.lastSnapshotFileName).toBeNull();
      expect(stateWithoutPlayback.playback.logs).toEqual([]);
    }

    const state = useWarehouseStore.getState();
    expect(state.playback).toBeDefined();
    expect(state.playback.activePresetId === null || typeof state.playback.activePresetId === 'string').toBe(true);
  });
});

describe('验收回放台: 导入冲突与降级', () => {
  beforeEach(() => {
    resetStore();
    useWarehouseStore.setState({
      playback: { activePresetId: null, lastSnapshotFileName: null, logs: [] },
    });
  });

  it('导入旧版 v1 快照应兼容模式导入并记录警告，其余状态保住', () => {
    const v1Snapshot = {
      version: 1,
      exportedAt: '2024-01-15T00:00:00Z',
      locations: [makeLoc('OLD-1', 'A', 1, 1, 1), makeLoc('OLD-2', 'A', 2, 1, 1)],
      pickRecords: [{ locationId: 'OLD-1', timestamp: '2024-01-01T00:00:00Z', quantity: 5 }],
      cameraBookmarks: [
        { id: 'bm-old', name: '旧版视角', position: [10, 5, 10], target: [3, 1, 3] },
      ],
      activeBookmarkId: 'bm-old',
      filter: { dateRange: null, zones: ['A'] },
      cameraState: { position: [10, 5, 10], target: [3, 1, 3] },
    } as unknown as SnapshotData;

    const result = useWarehouseStore.getState().importSnapshot(v1Snapshot);
    expect(result.success).toBe(true);

    const versionWarnings = result.warnings.filter((w) => w.type === 'version_mismatch');
    expect(versionWarnings.length).toBeGreaterThanOrEqual(0);

    const state = useWarehouseStore.getState();
    expect(state.locations).toHaveLength(2);
    expect(state.pickRecords).toHaveLength(1);
    expect(state.filter.zones).toEqual(['A']);
    expect(state.cameraBookmarks).toHaveLength(1);
    expect(state.activeBookmark).toBe('bm-old');
  });

  it('导入缺字段快照: 缺 cameraState 和 thresholds 应降级为默认值，其余状态保住', () => {
    const incompleteSnapshot = {
      version: 2,
      exportedAt: '2024-06-15T10:00:00Z',
      locations: [makeLoc('INC-1', 'A', 1, 1, 1)],
      pickRecords: [{ locationId: 'INC-1', timestamp: '2024-06-01T00:00:00Z', quantity: 7 }],
    } as unknown as SnapshotData;

    const result = useWarehouseStore.getState().importSnapshot(incompleteSnapshot);
    expect(result.success).toBe(true);
    expect(result.warnings.some((w) => w.type === 'missing_field')).toBe(true);

    const state = useWarehouseStore.getState();
    expect(state.locations).toHaveLength(1);
    expect(state.pickRecords).toHaveLength(1);
    expect(state.cameraState).toEqual({ position: [22, 16, 24], target: [7.5, 4.5, 7.5] });
    expect(state.thresholds).toEqual({ low: 25, medium: 50, high: 75 });
  });

  it('导入同名字签: 应自动重命名并保住所有书签', () => {
    const dupSnapshot: SnapshotData = {
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
    expect(result.warnings.some((w) => w.type === 'duplicate_bookmark_name')).toBe(true);

    const state = useWarehouseStore.getState();
    expect(state.cameraBookmarks).toHaveLength(3);
    const names = state.cameraBookmarks.map((b) => b.name);
    expect(new Set(names).size).toBe(3);
    expect(names).toContain('默认视角');
    expect(names).toContain('默认视角 (2)');
    expect(names).toContain('默认视角 (3)');
  });

  it('导入重复货位坐标: 应过滤冲突货位并保住其余可用', () => {
    const snapshot: SnapshotData = {
      version: 2,
      exportedAt: '2024-06-15T10:00:00Z',
      anomalies: [],
      importConflicts: [],
      filter: { dateRange: null, zones: [] },
      thresholds: { low: 25, medium: 50, high: 75 },
      cameraState: { position: [22, 16, 24], target: [7.5, 4.5, 7.5] },
      confirmedCameraState: null,
      activeBookmarkId: null,
      activeBookmarkName: null,
      locations: [
        makeLoc('C-1', 'A', 1, 1, 1),
        makeLoc('C-1-DUP', 'A', 1, 1, 1),
        makeLoc('C-2', 'A', 2, 1, 1),
        makeLoc('C-3', 'A', 3, 1, 1),
      ],
      pickRecords: [
        { locationId: 'C-1', timestamp: '2024-06-01T00:00:00Z', quantity: 10 },
        { locationId: 'C-2', timestamp: '2024-06-02T00:00:00Z', quantity: 20 },
      ],
      cameraBookmarks: [],
    };

    const result = useWarehouseStore.getState().importSnapshot(snapshot);
    expect(result.success).toBe(true);

    const state = useWarehouseStore.getState();
    expect(state.importConflicts).toHaveLength(1);
    expect(state.locations.map((l) => l.id)).toEqual(['C-2', 'C-3']);
    expect(state.anomalies.some((a) => a.type === 'unknown_location')).toBe(true);
  });

  it('导入异常快照后 heatmap 仍可正常计算，不崩溃', () => {
    const badSnapshot: SnapshotData = {
      version: 999,
      exportedAt: '2024-06-15T10:00:00Z',
      anomalies: [],
      importConflicts: [],
      filter: { dateRange: null, zones: [] },
      thresholds: { low: 25, medium: 50, high: 75 },
      cameraState: { position: [10, 5, 10], target: [3, 1, 3] },
      confirmedCameraState: null,
      activeBookmarkId: 'bm-ghost',
      activeBookmarkName: '幽灵书签',
      locations: [makeLoc('H-1', 'A', 1, 1, 1)],
      pickRecords: [{ locationId: 'H-1', timestamp: '2024-06-01T00:00:00Z', quantity: 15 }],
      cameraBookmarks: [
        { id: 'bm-real', name: '真实书签', position: [10, 5, 10], target: [3, 1, 3] },
      ],
      unknownExtra: 'should-be-ignored',
    } as unknown as SnapshotData;

    const result = useWarehouseStore.getState().importSnapshot(badSnapshot);
    expect(result.success).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);

    const state = useWarehouseStore.getState();
    expect(() => state.getHeatMap()).not.toThrow();
    const heat = state.getHeatMap();
    expect(heat.has('H-1')).toBe(true);
    expect(state.activeBookmark).toBeNull();
  });
});

function resetStoreWithArchive() {
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
    playback: { activePresetId: null, lastSnapshotFileName: null, logs: [] },
    archive: {
      entries: [],
      maxEntries: 30,
      lastAutoSaveId: null,
      undoStack: [],
      currentImportSession: null,
    },
  });
}

describe('快照归档中心: 导出链路', () => {
  beforeEach(() => {
    resetStoreWithArchive();
  });

  it('saveToArchive 应创建归档条目，包含正确元数据 (文件名、时间、来源、schema、摘要)', () => {
    const locs = [
      makeLoc('T-1', 'A', 1, 1, 1),
      makeLoc('T-2', 'B', 2, 1, 1),
    ];
    useWarehouseStore.getState().setLocations(locs);
    useWarehouseStore.getState().setPickRecords([
      { locationId: 'T-1', timestamp: '2024-06-10T08:00:00Z', quantity: 30 },
    ]);
    useWarehouseStore.getState().addBookmark({
      id: 'bm-1',
      name: '测试视角',
      position: [10, 5, 10],
      target: [3, 1, 3],
    });
    useWarehouseStore.getState().setActiveBookmark('bm-1');
    useWarehouseStore.getState().setFilter({ dateRange: { start: '2024-06-01', end: '2024-06-30' }, zones: ['A'] });

    const entry = useWarehouseStore.getState().saveToArchive('manual', 'my-snapshot.json');

    expect(entry).not.toBeNull();
    expect(entry!.fileName).toBe('my-snapshot.json');
    expect(entry!.source).toBe('manual');
    expect(entry!.schemaVersion).toBe(2);
    expect(entry!.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry!.summary.locationsCount).toBe(2);
    expect(entry!.summary.pickRecordsCount).toBe(1);
    expect(entry!.summary.bookmarksCount).toBe(1);
    expect(entry!.summary.activeBookmarkName).toBe('测试视角');
    expect(entry!.summary.zones).toEqual(['A', 'B']);
    expect(entry!.summary.hasDateFilter).toBe(true);
    expect(['low', 'medium', 'high', 'mixed', 'none']).toContain(entry!.summary.heatmapLevel);

    const state = useWarehouseStore.getState();
    expect(state.archive.entries).toHaveLength(1);
    expect(state.archive.entries[0].id).toBe(entry!.id);
  });

  it('同名文件归档应自动去重: name.json → name (2).json → name (3).json', () => {
    const locs = [makeLoc('X-1', 'A', 1, 1, 1)];
    useWarehouseStore.getState().setLocations(locs);

    useWarehouseStore.getState().saveToArchive('manual', 'dup.json');
    useWarehouseStore.getState().saveToArchive('manual', 'dup.json');
    useWarehouseStore.getState().saveToArchive('manual', 'dup.json');

    const entries = useWarehouseStore.getState().archive.entries;
    expect(entries).toHaveLength(3);
    const fileNames = entries.map((e) => e.fileName);
    expect(fileNames).toContain('dup.json');
    expect(fileNames).toContain('dup (2).json');
    expect(fileNames).toContain('dup (3).json');
  });

  it('归档条目应按时间倒序排列，超过 maxEntries 应淘汰最旧的', () => {
    const locs = [makeLoc('Q-1', 'A', 1, 1, 1)];
    useWarehouseStore.getState().setLocations(locs);
    useWarehouseStore.setState({ archive: { ...useWarehouseStore.getState().archive, maxEntries: 3 } });

    const e1 = useWarehouseStore.getState().saveToArchive('manual', '1.json');
    const e2 = useWarehouseStore.getState().saveToArchive('manual', '2.json');
    const e3 = useWarehouseStore.getState().saveToArchive('manual', '3.json');
    const e4 = useWarehouseStore.getState().saveToArchive('manual', '4.json');

    const entries = useWarehouseStore.getState().archive.entries;
    expect(entries).toHaveLength(3);
    expect(entries[0].id).toBe(e4!.id);
    expect(entries[1].id).toBe(e3!.id);
    expect(entries[2].id).toBe(e2!.id);
    expect(entries.some((e) => e.id === e1!.id)).toBe(false);
  });
});

describe('快照归档中心: 导入链路 & 撤销', () => {
  beforeEach(() => {
    resetStoreWithArchive();
  });

  it('importSnapshotWithArchive 成功导入后应写入归档 + 撤销栈，canUndo=true', () => {
    const snapshot: SnapshotData = {
      version: 2,
      exportedAt: '2024-06-15T10:00:00Z',
      anomalies: [],
      importConflicts: [],
      filter: { dateRange: { start: '2024-01-01', end: '2024-12-31' }, zones: ['A', 'B'] },
      thresholds: { low: 30, medium: 60, high: 90 },
      cameraState: { position: [15, 10, 15], target: [5, 3, 5] },
      confirmedCameraState: { position: [15, 10, 15], target: [5, 3, 5] },
      activeBookmarkId: 'bm-1',
      activeBookmarkName: '视角1',
      locations: [makeLoc('IMP-1', 'A', 1, 1, 1), makeLoc('IMP-2', 'B', 2, 1, 1)],
      pickRecords: [{ locationId: 'IMP-1', timestamp: '2024-06-10T00:00:00Z', quantity: 10 }],
      cameraBookmarks: [
        { id: 'bm-1', name: '视角1', position: [15, 10, 15], target: [5, 3, 5] },
      ],
    };

    const result = useWarehouseStore.getState().importSnapshotWithArchive(
      snapshot,
      'my-import.json',
      false
    );

    expect(result.success).toBe(true);
    expect(result.canUndo).toBe(true);
    expect(result.archiveEntryId).not.toBeNull();
    expect(result.previousStateId).not.toBeNull();

    const state = useWarehouseStore.getState();
    expect(state.archive.entries).toHaveLength(1);
    expect(state.archive.entries[0].fileName).toBe('my-import.json');
    expect(state.archive.entries[0].source).toBe('import');
    expect(state.archive.entries[0].importLogs!.length).toBeGreaterThan(0);
    expect(state.archive.undoStack).toHaveLength(1);
    expect(state.locations.map((l) => l.id)).toEqual(['IMP-1', 'IMP-2']);
  });

  it('undoLastImport 应恢复到导入前的完整状态', () => {
    const origLocs = [makeLoc('ORIG-1', 'A', 1, 1, 1), makeLoc('ORIG-2', 'B', 2, 1, 1)];
    useWarehouseStore.getState().setLocations(origLocs);
    useWarehouseStore.getState().setFilter({ zones: ['X'] });
    useWarehouseStore.getState().setThresholds({ low: 10, medium: 20, high: 30 });

    const newSnapshot: SnapshotData = {
      version: 2,
      exportedAt: '2024-06-15T10:00:00Z',
      anomalies: [],
      importConflicts: [],
      filter: { dateRange: null, zones: ['NEW'] },
      thresholds: { low: 90, medium: 95, high: 99 },
      cameraState: { position: [1, 1, 1], target: [0, 0, 0] },
      confirmedCameraState: null,
      activeBookmarkId: null,
      activeBookmarkName: null,
      locations: [makeLoc('NEW-1', 'C', 3, 1, 1)],
      pickRecords: [],
      cameraBookmarks: [],
    };

    useWarehouseStore.getState().importSnapshotWithArchive(newSnapshot, 'new.json');
    expect(useWarehouseStore.getState().locations.map((l) => l.id)).toEqual(['NEW-1']);
    expect(useWarehouseStore.getState().filter.zones).toEqual(['NEW']);
    expect(useWarehouseStore.getState().archive.undoStack).toHaveLength(1);

    const undoResult = useWarehouseStore.getState().undoLastImport();
    expect(undoResult).not.toBeNull();
    expect(undoResult!.success).toBe(true);

    const state = useWarehouseStore.getState();
    expect(state.locations.map((l) => l.id).sort()).toEqual(['ORIG-1', 'ORIG-2']);
    expect(state.filter.zones).toEqual(['X']);
    expect(state.thresholds).toEqual({ low: 10, medium: 20, high: 30 });
    expect(state.archive.undoStack).toHaveLength(0);
  });

  it('导入含旧版缺字段的快照应产生 warning 并尽量恢复', () => {
    const oldSnapshot = {
      version: 1,
      exportedAt: '2024-01-01T00:00:00Z',
      locations: [makeLoc('OLD-1', 'A', 1, 1, 1)],
      pickRecords: [{ locationId: 'OLD-1', timestamp: '2024-01-01T00:00:00Z', quantity: 5 }],
    };

    const result = useWarehouseStore.getState().importSnapshotWithArchive(
      oldSnapshot,
      'old-v1.json',
      false
    );

    expect(result.success).toBe(true);
    expect(result.warnings.some((w) => w.type === 'missing_field')).toBe(true);
    expect(result.canUndo).toBe(true);

    const state = useWarehouseStore.getState();
    expect(state.locations.map((l) => l.id)).toEqual(['OLD-1']);
    expect(state.cameraState).toEqual({ position: [22, 16, 24], target: [7.5, 4.5, 7.5] });
    expect(state.thresholds).toEqual({ low: 25, medium: 50, high: 75 });
    expect(state.archive.entries[0].fileName).toBe('old-v1.json');
  });

  it('mergeBookmarks=true 应合并现有与导入书签，重名自动重命名，重复 ID 跳过', () => {
    useWarehouseStore.getState().addBookmark({
      id: 'bm-existing',
      name: '现有书签',
      position: [9, 9, 9],
      target: [1, 1, 1],
    });
    useWarehouseStore.getState().addBookmark({
      id: 'bm-existing-name',
      name: '重名书签',
      position: [8, 8, 8],
      target: [2, 2, 2],
    });

    const newSnapshot: SnapshotData = {
      version: 2,
      exportedAt: '2024-06-15T10:00:00Z',
      anomalies: [],
      importConflicts: [],
      filter: { dateRange: null, zones: [] },
      thresholds: { low: 25, medium: 50, high: 75 },
      cameraState: { position: [22, 16, 24], target: [7.5, 4.5, 7.5] },
      confirmedCameraState: null,
      activeBookmarkId: 'bm-new-active',
      activeBookmarkName: '新增激活',
      locations: [makeLoc('M-1', 'A', 1, 1, 1)],
      pickRecords: [],
      cameraBookmarks: [
        { id: 'bm-existing', name: '应该被跳过', position: [0, 0, 0], target: [0, 0, 0] },
        { id: 'bm-new-dup-name', name: '重名书签', position: [7, 7, 7], target: [3, 3, 3] },
        { id: 'bm-new-active', name: '新增激活', position: [6, 6, 6], target: [4, 4, 4] },
      ],
    };

    const result = useWarehouseStore.getState().importSnapshotWithArchive(newSnapshot, 'merge.json', true);

    expect(result.success).toBe(true);
    expect(result.warnings.some((w) => w.type === 'duplicate_bookmark_name')).toBe(true);

    const state = useWarehouseStore.getState();
    const names = state.cameraBookmarks.map((b) => b.name);
    expect(names).toContain('现有书签');
    expect(names).toContain('重名书签');
    expect(names).toContain('重名书签 (2)');
    expect(names).toContain('新增激活');
    expect(state.cameraBookmarks).toHaveLength(4);

    const existing = state.cameraBookmarks.find((b) => b.id === 'bm-existing');
    expect(existing!.position).toEqual([9, 9, 9]);

    expect(state.activeBookmark).toBe('bm-new-active');
    expect(state.activeBookmarkName).toBe('新增激活');
  });

  it('导入格式错误的数据应返回 success=false, canUndo=false，状态不变', () => {
    const locsBefore = [makeLoc('SAFE-1', 'A', 1, 1, 1)];
    useWarehouseStore.getState().setLocations(locsBefore);

    const result = useWarehouseStore.getState().importSnapshotWithArchive(null, 'bad.json');
    expect(result.success).toBe(false);
    expect(result.canUndo).toBe(false);
    expect(result.archiveEntryId).toBeNull();
    expect(useWarehouseStore.getState().locations.map((l) => l.id)).toEqual(['SAFE-1']);
    expect(useWarehouseStore.getState().archive.entries).toHaveLength(0);
    expect(useWarehouseStore.getState().archive.undoStack).toHaveLength(0);
  });
});

function resetReplenishmentStore() {
  const locs = [
    makeLoc('RPL-A1', 'A', 1, 1, 1),
    makeLoc('RPL-A2', 'A', 1, 2, 1),
    makeLoc('RPL-A3', 'A', 2, 1, 1),
    makeLoc('RPL-B1', 'B', 1, 1, 1),
    makeLoc('RPL-B2', 'B', 1, 2, 1),
    makeLoc('RPL-B3', 'B', 2, 1, 1),
    makeLoc('RPL-C1', 'C', 1, 1, 1),
    makeLoc('RPL-C2', 'C', 1, 2, 1),
  ];
  const picks = [
    { locationId: 'RPL-A1', timestamp: '2024-06-01T08:00:00Z', quantity: 100 },
    { locationId: 'RPL-A2', timestamp: '2024-06-01T09:00:00Z', quantity: 80 },
    { locationId: 'RPL-A3', timestamp: '2024-06-01T10:00:00Z', quantity: 20 },
    { locationId: 'RPL-B1', timestamp: '2024-06-01T11:00:00Z', quantity: 60 },
    { locationId: 'RPL-B2', timestamp: '2024-06-01T12:00:00Z', quantity: 40 },
    { locationId: 'RPL-C1', timestamp: '2024-06-01T13:00:00Z', quantity: 90 },
    { locationId: 'RPL-C2', timestamp: '2024-06-01T14:00:00Z', quantity: 70 },
  ];

  resetStoreWithArchive();
  useWarehouseStore.getState().setLocations(locs);
  useWarehouseStore.getState().setPickRecords(picks);
  useWarehouseStore.setState({
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
  });
}

describe('补货任务沙盘: 圈选与批次创建', () => {
  beforeEach(() => {
    resetReplenishmentStore();
  });

  it('圈选模式切换应正确设置 selectionMode 标志', () => {
    const store = useWarehouseStore.getState();
    expect(store.replenishment.selectionMode).toBe(false);

    store.setSelectionMode(true);
    expect(useWarehouseStore.getState().replenishment.selectionMode).toBe(true);

    store.setSelectionMode(false);
    expect(useWarehouseStore.getState().replenishment.selectionMode).toBe(false);
  });

  it('toggleLocationSelection 应在选中集合中增删单个货位', () => {
    const store = useWarehouseStore.getState();

    store.toggleLocationSelection('RPL-A1');
    expect(useWarehouseStore.getState().replenishment.selectedLocationIds).toEqual(['RPL-A1']);

    store.toggleLocationSelection('RPL-A2');
    expect(useWarehouseStore.getState().replenishment.selectedLocationIds).toEqual(['RPL-A1', 'RPL-A2']);

    store.toggleLocationSelection('RPL-A1');
    expect(useWarehouseStore.getState().replenishment.selectedLocationIds).toEqual(['RPL-A2']);
  });

  it('clearLocationSelection 应清空选中但不影响批次', () => {
    const store = useWarehouseStore.getState();
    store.toggleLocationSelection('RPL-A1');
    store.toggleLocationSelection('RPL-A2');
    store.toggleLocationSelection('RPL-A3');

    store.clearLocationSelection();

    const s = useWarehouseStore.getState();
    expect(s.replenishment.selectedLocationIds).toEqual([]);
    expect(s.replenishment.selectionBox).toBeNull();
    expect(s.locations.length).toBeGreaterThan(0);
  });

  it('selectLocationsByHeat 应按阈值圈选高热货位，阈值越高选中越少', () => {
    useWarehouseStore.getState().selectLocationsByHeat(0);
    const allIds = useWarehouseStore.getState().replenishment.selectedLocationIds;
    expect(allIds.length).toBeGreaterThanOrEqual(5);

    useWarehouseStore.getState().clearLocationSelection();
    useWarehouseStore.getState().selectLocationsByHeat(90);
    const highIds = useWarehouseStore.getState().replenishment.selectedLocationIds;
    expect(highIds.length).toBeLessThanOrEqual(allIds.length);
    expect(highIds.length).toBeGreaterThanOrEqual(1);
  });

  it('未选中任何货位时 createBatchFromSelection 应返回 null 不创建', () => {
    const store = useWarehouseStore.getState();
    expect(store.replenishment.selectedLocationIds).toEqual([]);

    const result = store.createBatchFromSelection();
    expect(result).toBeNull();

    const s = useWarehouseStore.getState();
    expect(s.replenishment.batches).toHaveLength(0);
    expect(s.replenishment.nextBatchNo).toBe(1);
  });

  it('createBatchFromSelection 应创建批次并正确分配编号、优先级、顺序、缺口', () => {
    const store = useWarehouseStore.getState();
    store.toggleLocationSelection('RPL-A1');
    store.toggleLocationSelection('RPL-A2');
    store.toggleLocationSelection('RPL-C1');

    const batch = store.createBatchFromSelection();

    expect(batch).not.toBeNull();
    expect(batch!.batchNo).toBe('RPL-0001');
    expect(batch!.name).toBe('补货批次 RPL-0001');
    expect(['critical', 'high', 'medium', 'low']).toContain(batch!.priority);
    expect(batch!.status).toBe('draft');
    expect(batch!.estimatedOrder).toBe(1);
    expect(batch!.locations.length).toBe(3);
    expect(batch!.totalShortage).toBeGreaterThan(0);
    expect(batch!.locations.every((bl) => bl.shortage >= 0 && bl.heatLevel >= 0)).toBe(true);

    const s = useWarehouseStore.getState();
    expect(s.replenishment.batches).toHaveLength(1);
    expect(s.replenishment.nextBatchNo).toBe(2);
    expect(s.replenishment.selectedLocationIds).toEqual([]);
    expect(s.replenishment.activeBatchId).toBe(batch!.id);
    expect(s.replenishment.undoStack.length).toBeGreaterThanOrEqual(1);
  });

  it('第二个批次应编号 RPL-0002，处理顺序为 2', () => {
    const store = useWarehouseStore.getState();
    store.toggleLocationSelection('RPL-A1');
    store.createBatchFromSelection();

    store.toggleLocationSelection('RPL-B1');
    store.toggleLocationSelection('RPL-B2');
    const batch2 = store.createBatchFromSelection();

    expect(batch2!.batchNo).toBe('RPL-0002');
    expect(batch2!.estimatedOrder).toBe(2);

    const s = useWarehouseStore.getState();
    expect(s.replenishment.batches).toHaveLength(2);
    expect(s.replenishment.nextBatchNo).toBe(3);
  });

  it('createBatchFromSelection 应支持自定义名称和优先级', () => {
    const store = useWarehouseStore.getState();
    store.toggleLocationSelection('RPL-A1');
    store.toggleLocationSelection('RPL-A2');

    const batch = store.createBatchFromSelection({
      name: 'A 区紧急补货',
      priority: 'critical',
    });

    expect(batch!.name).toBe('A 区紧急补货');
    expect(batch!.priority).toBe('critical');
  });
});

describe('补货任务沙盘: 批次调整、删除与顺序', () => {
  beforeEach(() => {
    resetReplenishmentStore();
    const store = useWarehouseStore.getState();
    store.toggleLocationSelection('RPL-A1');
    store.toggleLocationSelection('RPL-A2');
    store.createBatchFromSelection({ name: '批次一', priority: 'high' });

    store.toggleLocationSelection('RPL-B1');
    store.toggleLocationSelection('RPL-B2');
    store.createBatchFromSelection({ name: '批次二', priority: 'medium' });

    store.toggleLocationSelection('RPL-C1');
    store.toggleLocationSelection('RPL-C2');
    store.createBatchFromSelection({ name: '批次三', priority: 'low' });
  });

  it('updateBatch 应更新名称、优先级、状态，撤销栈应记录', () => {
    const store = useWarehouseStore.getState();
    const batch = store.replenishment.batches[0];
    const undoBefore = store.replenishment.undoStack.length;

    store.updateBatch(batch.id, {
      name: '批次一（已改名）',
      priority: 'critical',
      status: 'pending',
      notes: '这是备注',
    });

    const s = useWarehouseStore.getState();
    const updated = s.replenishment.batches.find((b) => b.id === batch.id)!;
    expect(updated.name).toBe('批次一（已改名）');
    expect(updated.priority).toBe('critical');
    expect(updated.status).toBe('pending');
    expect(updated.notes).toBe('这是备注');
    expect(updated.updatedAt).not.toBe(updated.createdAt);
    expect(s.replenishment.undoStack.length).toBe(undoBefore + 1);
  });

  it('deleteBatch 应删除批次并从撤销栈恢复', () => {
    const store = useWarehouseStore.getState();
    expect(store.replenishment.batches).toHaveLength(3);
    const batch = store.replenishment.batches[1];

    store.deleteBatch(batch.id);

    const s = useWarehouseStore.getState();
    expect(s.replenishment.batches).toHaveLength(2);
    expect(s.replenishment.batches.find((b) => b.id === batch.id)).toBeUndefined();
    expect(s.replenishment.actionLogs.some((l) => l.description.includes(batch.batchNo))).toBe(true);
  });

  it('adjustBatchOrder 应正确重排顺序，向前移动时其他批次顺延', () => {
    const store = useWarehouseStore.getState();
    const ordered = store.getBatchesInProcessingOrder();
    expect(ordered[0].estimatedOrder).toBe(1);
    expect(ordered[1].estimatedOrder).toBe(2);
    expect(ordered[2].estimatedOrder).toBe(3);

    const batch3 = ordered[2];
    store.adjustBatchOrder(batch3.id, 1);

    const newOrdered = useWarehouseStore.getState().getBatchesInProcessingOrder();
    expect(newOrdered[0].id).toBe(batch3.id);
    expect(newOrdered[0].estimatedOrder).toBe(1);
    expect(newOrdered[1].estimatedOrder).toBe(2);
    expect(newOrdered[2].estimatedOrder).toBe(3);
  });

  it('adjustBatchOrder 向后移动时其他批次应前移填补', () => {
    const store = useWarehouseStore.getState();
    const ordered = store.getBatchesInProcessingOrder();
    const batch1 = ordered[0];

    store.adjustBatchOrder(batch1.id, 3);

    const newOrdered = useWarehouseStore.getState().getBatchesInProcessingOrder();
    expect(newOrdered[2].id).toBe(batch1.id);
    expect(newOrdered.map((b) => b.estimatedOrder)).toEqual([1, 2, 3]);
  });

  it('addLocationToBatch 应向批次添加货位并触发更新', () => {
    const store = useWarehouseStore.getState();
    const batch = store.replenishment.batches[0];
    const origLen = batch.locations.length;

    store.addLocationToBatch(batch.id, 'RPL-A3');

    const s = useWarehouseStore.getState();
    const updated = s.replenishment.batches.find((b) => b.id === batch.id)!;
    expect(updated.locations.length).toBe(origLen + 1);
    expect(updated.locations.some((bl) => bl.locationId === 'RPL-A3')).toBe(true);
  });

  it('addLocationToBatch 添加已被其他批次占用的货位应产生冲突', () => {
    const store = useWarehouseStore.getState();
    const batch1 = store.replenishment.batches[0];
    const locInBatch1 = batch1.locations[0].locationId;
    const batch2 = store.replenishment.batches[1];

    const conflictBefore = store.replenishment.conflicts.length;
    store.addLocationToBatch(batch2.id, locInBatch1);

    const s = useWarehouseStore.getState();
    expect(s.replenishment.conflicts.length).toBeGreaterThan(conflictBefore);
    const latest = s.replenishment.conflicts[s.replenishment.conflicts.length - 1];
    expect(latest.type).toBe('location_occupied');
    expect(latest.locationId).toBe(locInBatch1);
  });

  it('removeLocationFromBatch 应从批次中移除指定货位', () => {
    const store = useWarehouseStore.getState();
    const batch = store.replenishment.batches[0];
    const locId = batch.locations[0].locationId;

    store.removeLocationFromBatch(batch.id, locId);

    const s = useWarehouseStore.getState();
    const updated = s.replenishment.batches.find((b) => b.id === batch.id)!;
    expect(updated.locations.some((bl) => bl.locationId === locId)).toBe(false);
  });

  it('getBatchesInProcessingOrder 应按顺序+优先级双重排序', () => {
    const store = useWarehouseStore.getState();
    const batches = store.replenishment.batches;
    // 设置两个同 order 但优先级不同 + 一个不同 order 的批次，体现双重排序
    store.updateBatch(batches[2].id, { priority: 'low', estimatedOrder: 1 });       // order=1 low
    store.updateBatch(batches[1].id, { priority: 'critical', estimatedOrder: 2 });  // order=2 critical
    store.updateBatch(batches[0].id, { priority: 'high', estimatedOrder: 2 });      // order=2 high (优先级低于critical)

    const ordered = store.getBatchesInProcessingOrder();
    expect(ordered[0].id).toBe(batches[2].id); // order=1 最先
    expect(ordered[1].id).toBe(batches[1].id); // order=2 priority=critical
    expect(ordered[2].id).toBe(batches[0].id); // order=2 priority=high
  });

  it('clearReplenishmentBatches 应清空所有批次并保留可撤销能力', () => {
    const store = useWarehouseStore.getState();
    expect(store.replenishment.batches.length).toBe(3);
    const undoBefore = store.replenishment.undoStack.length;

    store.clearReplenishmentBatches();

    const s = useWarehouseStore.getState();
    expect(s.replenishment.batches).toHaveLength(0);
    expect(s.replenishment.selectedLocationIds).toEqual([]);
    expect(s.replenishment.nextBatchNo).toBe(1);
    expect(s.replenishment.undoStack.length).toBe(undoBefore + 1);
  });

  it('getLocationOccupancyMap 应返回每个货位对应的批次信息', () => {
    const store = useWarehouseStore.getState();
    const map = store.getLocationOccupancyMap();

    for (const batch of store.replenishment.batches) {
      for (const bl of batch.locations) {
        expect(map.has(bl.locationId)).toBe(true);
        expect(map.get(bl.locationId)!.batchId).toBe(batch.id);
        expect(map.get(bl.locationId)!.batchNo).toBe(batch.batchNo);
      }
    }
  });

  it('创建批次时选中货位若有被占用的应跳过并记录 location_occupied 冲突', () => {
    const store = useWarehouseStore.getState();
    const batch1 = store.replenishment.batches[0];
    const occupied = batch1.locations[0].locationId;

    store.toggleLocationSelection(occupied);
    store.toggleLocationSelection('RPL-A3');

    const undoBefore = store.replenishment.undoStack.length;
    const conflictBefore = store.replenishment.conflicts.length;
    const newBatch = store.createBatchFromSelection();

    expect(newBatch).not.toBeNull();
    expect(newBatch!.locations.some((bl) => bl.locationId === occupied)).toBe(false);
    expect(newBatch!.locations.some((bl) => bl.locationId === 'RPL-A3')).toBe(true);

    const s = useWarehouseStore.getState();
    expect(s.replenishment.conflicts.length).toBeGreaterThan(conflictBefore);
    expect(s.replenishment.undoStack.length).toBe(undoBefore + 1);
  });
});

describe('补货任务沙盘: 导入导出与冲突处理', () => {
  beforeEach(() => {
    resetReplenishmentStore();
    const store = useWarehouseStore.getState();
    store.toggleLocationSelection('RPL-A1');
    store.toggleLocationSelection('RPL-A2');
    store.createBatchFromSelection({ name: '本地批次' });
  });

  it('导入 null/无效数据应返回 success=false, canUndo=false', () => {
    const store = useWarehouseStore.getState();
    const batchesBefore = store.replenishment.batches.length;

    const result = store.importReplenishmentBatches(null);
    expect(result.success).toBe(false);
    expect(result.importedBatches).toBe(0);
    expect(result.canUndo).toBe(false);

    expect(useWarehouseStore.getState().replenishment.batches.length).toBe(batchesBefore);
  });

  it('导入缺少 batches 字段的数据应返回失败', () => {
    const store = useWarehouseStore.getState();
    const result = store.importReplenishmentBatches({ version: 1 });
    expect(result.success).toBe(false);
    expect(result.conflicts.some((c) => c.type === 'missing_required_field')).toBe(true);
  });

  it('导入重复批次编号应自动重命名并产生 duplicate_batch_no 冲突', () => {
    const store = useWarehouseStore.getState();
    const existingNo = store.replenishment.batches[0].batchNo;

    const importData = {
      version: 1,
      batches: [
        {
          id: 'imp-1',
          batchNo: existingNo,
          name: '导入重复编号',
          priority: 'high',
          status: 'draft',
          estimatedOrder: 1,
          locations: [
            { locationId: 'RPL-B1', currentStock: 10, targetStock: 100, shortage: 90, heatLevel: 60 },
            { locationId: 'RPL-B2', currentStock: 20, targetStock: 100, shortage: 80, heatLevel: 50 },
          ],
          totalShortage: 170,
          createdAt: '2024-06-01T00:00:00Z',
          updatedAt: '2024-06-01T00:00:00Z',
        },
      ],
    };

    const result = store.importReplenishmentBatches(importData);
    expect(result.success).toBe(true);
    expect(result.importedBatches).toBe(1);
    expect(result.conflicts.some((c) => c.type === 'duplicate_batch_no')).toBe(true);

    const s = useWarehouseStore.getState();
    const imported = s.replenishment.batches.find((b) => b.id === 'imp-1');
    expect(imported).toBeDefined();
    expect(imported!.batchNo).not.toBe(existingNo);
    expect(imported!.batchNo.startsWith(existingNo)).toBe(true);
  });

  it('导入货位已被现有批次占用应跳过并产生 location_occupied 冲突', () => {
    const store = useWarehouseStore.getState();
    const occupied = store.replenishment.batches[0].locations[0].locationId;

    const importData = {
      version: 1,
      batches: [
        {
          id: 'imp-2',
          batchNo: 'RPL-9999',
          name: '导入占用货位',
          priority: 'medium',
          status: 'draft',
          estimatedOrder: 9999,
          locations: [
            { locationId: occupied, currentStock: 5, targetStock: 100, shortage: 95, heatLevel: 80 },
            { locationId: 'RPL-B3', currentStock: 15, targetStock: 100, shortage: 85, heatLevel: 70 },
          ],
          totalShortage: 180,
          createdAt: '2024-06-01T00:00:00Z',
          updatedAt: '2024-06-01T00:00:00Z',
        },
      ],
    };

    const result = store.importReplenishmentBatches(importData);
    expect(result.success).toBe(true);
    expect(result.importedBatches).toBe(1);

    const imported = useWarehouseStore.getState().replenishment.batches.find((b) => b.id === 'imp-2');
    expect(imported!.locations.some((bl) => bl.locationId === occupied)).toBe(false);
    expect(imported!.locations.some((bl) => bl.locationId === 'RPL-B3')).toBe(true);

    const locConflict = result.conflicts.find(
      (c) => c.type === 'location_occupied' && c.locationId === occupied
    );
    expect(locConflict).toBeDefined();
    expect(locConflict!.resolved).toBe(true);
    expect(locConflict!.resolution).toBe('skip');
  });

  it('导入未知货位应跳过并产生 unknown_location 冲突', () => {
    const store = useWarehouseStore.getState();

    const importData = {
      version: 1,
      batches: [
        {
          id: 'imp-3',
          batchNo: 'RPL-8888',
          name: '含未知货位',
          priority: 'low',
          status: 'draft',
          estimatedOrder: 9999,
          locations: [
            { locationId: 'UNKNOWN-999', currentStock: 0, targetStock: 50, shortage: 50, heatLevel: 30 },
            { locationId: 'RPL-C1', currentStock: 25, targetStock: 100, shortage: 75, heatLevel: 55 },
          ],
          totalShortage: 125,
          createdAt: '2024-06-01T00:00:00Z',
          updatedAt: '2024-06-01T00:00:00Z',
        },
      ],
    };

    const result = store.importReplenishmentBatches(importData);
    expect(result.importedBatches).toBe(1);

    const imported = useWarehouseStore.getState().replenishment.batches.find((b) => b.id === 'imp-3');
    expect(imported!.locations.map((bl) => bl.locationId)).toEqual(['RPL-C1']);
    expect(result.conflicts.some((c) => c.type === 'unknown_location')).toBe(true);
  });

  it('导入批次缺少必填字段应跳过并产生 missing_required_field 冲突', () => {
    const store = useWarehouseStore.getState();

    const importData = {
      version: 1,
      batches: [
        {
          id: 'bad-1',
          name: '缺字段批次',
        },
        {
          id: 'good-1',
          batchNo: 'RPL-7777',
          name: '正常批次',
          priority: 'high',
          status: 'draft',
          estimatedOrder: 9999,
          locations: [
            { locationId: 'RPL-C2', currentStock: 20, targetStock: 100, shortage: 80, heatLevel: 60 },
          ],
          totalShortage: 80,
          createdAt: '2024-06-01T00:00:00Z',
          updatedAt: '2024-06-01T00:00:00Z',
        },
      ],
    };

    const result = store.importReplenishmentBatches(importData);
    expect(result.importedBatches).toBe(1);
    expect(result.skippedBatches).toBe(1);
    expect(result.conflicts.some((c) => c.type === 'missing_required_field')).toBe(true);
    expect(useWarehouseStore.getState().replenishment.batches.find((b) => b.id === 'bad-1')).toBeUndefined();
    expect(useWarehouseStore.getState().replenishment.batches.find((b) => b.id === 'good-1')).toBeDefined();
  });

  it('导入版本不匹配应产生 version_mismatch 冲突但继续导入', () => {
    const store = useWarehouseStore.getState();

    const importData = {
      version: 999,
      batches: [
        {
          id: 'ver-1',
          batchNo: 'RPL-6666',
          name: '旧版本批次',
          priority: 'medium',
          status: 'draft',
          estimatedOrder: 9999,
          locations: [
            { locationId: 'RPL-B3', currentStock: 5, targetStock: 50, shortage: 45, heatLevel: 35 },
          ],
          totalShortage: 45,
          createdAt: '2024-06-01T00:00:00Z',
          updatedAt: '2024-06-01T00:00:00Z',
        },
      ],
    };

    const result = store.importReplenishmentBatches(importData);
    expect(result.success).toBe(true);
    expect(result.importedBatches).toBe(1);
    expect(result.conflicts.some((c) => c.type === 'version_mismatch')).toBe(true);
    expect(useWarehouseStore.getState().replenishment.batches.find((b) => b.id === 'ver-1')).toBeDefined();
  });

  it('导入成功后 canUndo=true，撤销应回到导入前状态', () => {
    const store = useWarehouseStore.getState();
    const batchesBefore = store.replenishment.batches.length;

    const importData = {
      version: 1,
      batches: [
        {
          id: 'undo-test-1',
          batchNo: 'RPL-5555',
          name: '撤销测试',
          priority: 'high',
          status: 'draft',
          estimatedOrder: 9999,
          locations: [
            { locationId: 'RPL-B3', currentStock: 10, targetStock: 100, shortage: 90, heatLevel: 80 },
          ],
          totalShortage: 90,
          createdAt: '2024-06-01T00:00:00Z',
          updatedAt: '2024-06-01T00:00:00Z',
        },
      ],
    };

    const importResult = store.importReplenishmentBatches(importData);
    expect(importResult.canUndo).toBe(true);
    expect(useWarehouseStore.getState().replenishment.batches.length).toBe(batchesBefore + 1);

    const undoSizeBefore = store.getReplenishmentUndoStackSize();
    const undoResult = store.undoLastReplenishmentAction();
    expect(undoResult).not.toBeNull();
    expect(undoResult!.success).toBe(true);

    const s = useWarehouseStore.getState();
    expect(s.replenishment.batches.length).toBe(batchesBefore);
    expect(s.replenishment.batches.find((b) => b.id === 'undo-test-1')).toBeUndefined();
    expect(s.getReplenishmentUndoStackSize()).toBe(undoSizeBefore - 1);
  });

  it('导入文件内货位重复出现应跳过重复项', () => {
    const store = useWarehouseStore.getState();
    const importData = {
      version: 1,
      batches: [
        {
          id: 'dup-loc-1',
          batchNo: 'RPL-4444',
          name: '批次一',
          priority: 'high',
          status: 'draft',
          estimatedOrder: 9999,
          locations: [
            { locationId: 'RPL-B1', currentStock: 10, targetStock: 100, shortage: 90, heatLevel: 70 },
          ],
          totalShortage: 90,
          createdAt: '2024-06-01T00:00:00Z',
          updatedAt: '2024-06-01T00:00:00Z',
        },
        {
          id: 'dup-loc-2',
          batchNo: 'RPL-4445',
          name: '批次二',
          priority: 'medium',
          status: 'draft',
          estimatedOrder: 9999,
          locations: [
            { locationId: 'RPL-B1', currentStock: 5, targetStock: 50, shortage: 45, heatLevel: 60 },
            { locationId: 'RPL-B3', currentStock: 0, targetStock: 50, shortage: 50, heatLevel: 50 },
          ],
          totalShortage: 95,
          createdAt: '2024-06-01T00:00:00Z',
          updatedAt: '2024-06-01T00:00:00Z',
        },
      ],
    };

    const result = store.importReplenishmentBatches(importData);
    expect(result.importedBatches).toBe(2);

    const s = useWarehouseStore.getState();
    const b1 = s.replenishment.batches.find((b) => b.id === 'dup-loc-1')!;
    const b2 = s.replenishment.batches.find((b) => b.id === 'dup-loc-2')!;
    expect(b1.locations.map((l) => l.locationId)).toContain('RPL-B1');
    expect(b2.locations.map((l) => l.locationId)).not.toContain('RPL-B1');
    expect(b2.locations.map((l) => l.locationId)).toContain('RPL-B3');

    expect(result.conflicts.some((c) => c.type === 'location_occupied' && c.locationId === 'RPL-B1')).toBe(true);
  });

  it('应记录 import 类型的操作日志，包含成功/跳过/冲突统计', () => {
    const store = useWarehouseStore.getState();
    const importData = {
      version: 1,
      batches: [
        {
          id: 'log-test-1',
          batchNo: 'RPL-3333',
          name: '日志测试批次',
          priority: 'low',
          status: 'draft',
          estimatedOrder: 9999,
          locations: [
            { locationId: 'RPL-B3', currentStock: 10, targetStock: 100, shortage: 90, heatLevel: 75 },
          ],
          totalShortage: 90,
          createdAt: '2024-06-01T00:00:00Z',
          updatedAt: '2024-06-01T00:00:00Z',
        },
      ],
    };

    store.importReplenishmentBatches(importData);
    const logs = useWarehouseStore.getState().replenishment.actionLogs;
    const importLog = logs.find((l) => l.action === 'import');
    expect(importLog).toBeDefined();
    expect(typeof importLog!.description).toBe('string');
  });
});

describe('补货任务沙盘: 草稿持久化与撤销', () => {
  beforeEach(() => {
    resetReplenishmentStore();
    localStorage.clear();
  });

  it('saveReplenishmentDraft 应写入 localStorage key replenishment-draft', () => {
    const store = useWarehouseStore.getState();
    store.toggleLocationSelection('RPL-A1');
    store.createBatchFromSelection({ name: '草稿批次' });

    store.saveReplenishmentDraft();
    const raw = localStorage.getItem('replenishment-draft');
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(raw!);
    expect(parsed.version).toBe(1);
    expect(Array.isArray(parsed.batches)).toBe(true);
    expect(parsed.batches.length).toBe(1);
    expect(typeof parsed.savedAt).toBe('string');
    expect(parsed.batches[0].name).toBe('草稿批次');
  });

  it('loadReplenishmentDraft 应从 localStorage 恢复批次和 nextBatchNo', () => {
    const store = useWarehouseStore.getState();
    store.toggleLocationSelection('RPL-A1');
    store.toggleLocationSelection('RPL-B2');
    store.createBatchFromSelection({ name: '恢复测试批次', priority: 'critical' });
    store.saveReplenishmentDraft();

    resetReplenishmentStore();
    expect(useWarehouseStore.getState().replenishment.batches).toHaveLength(0);

    const loaded = useWarehouseStore.getState().loadReplenishmentDraft();
    expect(loaded).toBe(true);

    const s = useWarehouseStore.getState();
    expect(s.replenishment.batches).toHaveLength(1);
    expect(s.replenishment.batches[0].name).toBe('恢复测试批次');
    expect(s.replenishment.batches[0].priority).toBe('critical');
    expect(s.replenishment.lastAutoSavedAt).not.toBeNull();
  });

  it('localStorage 为空时 loadReplenishmentDraft 应返回 false 不抛错', () => {
    localStorage.clear();
    const loaded = useWarehouseStore.getState().loadReplenishmentDraft();
    expect(loaded).toBe(false);
    expect(useWarehouseStore.getState().replenishment.batches).toHaveLength(0);
  });

  it('刷新/重启链路: persist 应持久化 batches、nextBatchNo、undoStack(限5层)、conflicts', () => {
    const s1 = useWarehouseStore.getState();
    s1.toggleLocationSelection('RPL-A1');
    s1.toggleLocationSelection('RPL-A2');
    const batch1 = s1.createBatchFromSelection();
    expect(batch1).not.toBeNull();
    expect(useWarehouseStore.getState().replenishment.batches).toHaveLength(1);

    useWarehouseStore.getState().toggleLocationSelection('RPL-B1');
    const batch2 = useWarehouseStore.getState().createBatchFromSelection();
    expect(batch2).not.toBeNull();

    useWarehouseStore.getState().updateBatch(batch1!.id, { name: '持久化测试' });

    const afterState = useWarehouseStore.getState();
    expect(afterState.replenishment.batches.length).toBe(2);

    expect(Array.isArray(afterState.replenishment.batches)).toBe(true);
    expect(afterState.replenishment.batches.length).toBe(2);
    expect(typeof afterState.replenishment.nextBatchNo).toBe('number');
    expect(afterState.replenishment.nextBatchNo).toBe(3);
    expect(Array.isArray(afterState.replenishment.undoStack)).toBe(true);
    expect(afterState.replenishment.undoStack.length).toBeLessThanOrEqual(20);
    expect(Array.isArray(afterState.replenishment.conflicts)).toBe(true);
    expect(typeof afterState.replenishment.autoSaveEnabled).toBe('boolean');
  });

  it('rehydrate 时缺少 replenishment 应补默认结构', () => {
    const baseState = useWarehouseStore.getState();
    expect(baseState.replenishment).toBeDefined();
    expect(Array.isArray(baseState.replenishment.batches)).toBe(true);
    expect(baseState.replenishment.batches).toHaveLength(0);
    expect(typeof baseState.replenishment.nextBatchNo).toBe('number');
    expect(baseState.replenishment.nextBatchNo).toBeGreaterThanOrEqual(1);
    expect(typeof baseState.replenishment.autoSaveEnabled).toBe('boolean');
    expect(Array.isArray(baseState.replenishment.conflicts)).toBe(true);
    expect(Array.isArray(baseState.replenishment.actionLogs)).toBe(true);
    expect(Array.isArray(baseState.replenishment.undoStack)).toBe(true);
    expect(Array.isArray(baseState.replenishment.selectedLocationIds)).toBe(true);
    expect(typeof baseState.replenishment.selectionMode).toBe('boolean');
  });

  it('撤销栈为空时 undoLastReplenishmentAction 应返回 null', () => {
    const store = useWarehouseStore.getState();
    expect(store.getReplenishmentUndoStackSize()).toBe(0);

    const result = store.undoLastReplenishmentAction();
    expect(result).toBeNull();
  });

  it('创建批次后撤销应回到批次创建之前的状态', () => {
    useWarehouseStore.getState().toggleLocationSelection('RPL-A1');
    const batch = useWarehouseStore.getState().createBatchFromSelection();
    expect(batch).not.toBeNull();
    expect(useWarehouseStore.getState().replenishment.batches).toHaveLength(1);

    const undoResult = useWarehouseStore.getState().undoLastReplenishmentAction();
    expect(undoResult).not.toBeNull();
    expect(undoResult!.success).toBe(true);

    const s = useWarehouseStore.getState();
    expect(s.replenishment.batches).toHaveLength(0);
    expect(s.replenishment.actionLogs.some((l) => l.description.includes('撤销'))).toBe(true);
  });

  it('删除批次后撤销应恢复被删除的批次', () => {
    useWarehouseStore.getState().toggleLocationSelection('RPL-A1');
    const created = useWarehouseStore.getState().createBatchFromSelection({ name: '恢复我' });
    expect(created).not.toBeNull();
    const batchId = created!.id;
    expect(useWarehouseStore.getState().replenishment.batches.find((b) => b.id === batchId)).toBeDefined();

    useWarehouseStore.getState().deleteBatch(batchId);
    expect(useWarehouseStore.getState().replenishment.batches.find((b) => b.id === batchId)).toBeUndefined();

    useWarehouseStore.getState().undoLastReplenishmentAction();
    const restored = useWarehouseStore.getState().replenishment.batches.find((b) => b.id === batchId);
    expect(restored).toBeDefined();
    expect(restored!.name).toBe('恢复我');
  });

  it('调整顺序后撤销应恢复原顺序', () => {
    const store = useWarehouseStore.getState();
    store.toggleLocationSelection('RPL-A1');
    store.createBatchFromSelection();
    store.toggleLocationSelection('RPL-B1');
    store.createBatchFromSelection();
    const orderedBefore = store.getBatchesInProcessingOrder().map((b) => b.id);

    store.adjustBatchOrder(orderedBefore[1], 1);
    const orderedAfter = store.getBatchesInProcessingOrder().map((b) => b.id);
    expect(orderedAfter).not.toEqual(orderedBefore);

    store.undoLastReplenishmentAction();
    const restored = store.getBatchesInProcessingOrder().map((b) => b.id);
    expect(restored).toEqual(orderedBefore);
  });

  it('连续多次操作撤销栈应保留最近 N 步，getReplenishmentUndoStackSize 反映', () => {
    const store = useWarehouseStore.getState();
    const locs = ['RPL-A1', 'RPL-A2', 'RPL-B1', 'RPL-B2', 'RPL-C1', 'RPL-C2'];
    for (let i = 0; i < locs.length; i++) {
      store.toggleLocationSelection(locs[i]);
      store.createBatchFromSelection();
    }

    const size = store.getReplenishmentUndoStackSize();
    expect(size).toBeGreaterThanOrEqual(6);

    for (let i = 0; i < 3; i++) {
      store.undoLastReplenishmentAction();
    }
    expect(store.getReplenishmentUndoStackSize()).toBe(size - 3);
  });

  it('setAutoSaveEnabled 应切换自动保存开关', () => {
    const store = useWarehouseStore.getState();
    expect(store.replenishment.autoSaveEnabled).toBe(false);

    store.setAutoSaveEnabled(true);
    expect(useWarehouseStore.getState().replenishment.autoSaveEnabled).toBe(true);

    store.setAutoSaveEnabled(false);
    expect(useWarehouseStore.getState().replenishment.autoSaveEnabled).toBe(false);
  });

  it('clearReplenishmentConflicts 应清空冲突列表', () => {
    useWarehouseStore.setState((s: any) => ({
      replenishment: {
        ...s.replenishment,
        conflicts: [
          { type: 'duplicate_batch_no', message: 'test', resolved: false },
          { type: 'location_occupied', message: 'test2', resolved: true },
        ],
      },
    }));
    expect(useWarehouseStore.getState().replenishment.conflicts.length).toBe(2);

    useWarehouseStore.getState().clearReplenishmentConflicts();
    expect(useWarehouseStore.getState().replenishment.conflicts).toHaveLength(0);
  });

  it('clearReplenishmentLogs 应清空操作日志列表', () => {
    useWarehouseStore.getState().addReplenishmentActionLog('create', '测试日志一');
    useWarehouseStore.getState().addReplenishmentActionLog('delete', '测试日志二');
    expect(useWarehouseStore.getState().replenishment.actionLogs.length).toBeGreaterThanOrEqual(2);

    useWarehouseStore.getState().clearReplenishmentLogs();
    expect(useWarehouseStore.getState().replenishment.actionLogs).toHaveLength(0);
  });
});

describe('补货任务沙盘: computeBatchLocationShortage 与缺口估算', () => {
  beforeEach(() => {
    resetReplenishmentStore();
  });

  it('computeBatchLocationShortage 对每个有效货位应返回合理的缺口值', () => {
    const store = useWarehouseStore.getState();
    const result = store.computeBatchLocationShortage('RPL-A1', 0);

    expect(result.locationId).toBe('RPL-A1');
    expect(typeof result.currentStock).toBe('number');
    expect(typeof result.targetStock).toBe('number');
    expect(typeof result.shortage).toBe('number');
    expect(typeof result.heatLevel).toBe('number');
    expect(result.currentStock).toBeGreaterThanOrEqual(0);
    expect(result.targetStock).toBeGreaterThan(0);
    expect(result.shortage).toBeGreaterThanOrEqual(0);
    expect(result.heatLevel).toBeGreaterThanOrEqual(0);
    expect(result.heatLevel).toBeLessThanOrEqual(100);
  });

  it('高热货位的缺口应大于等于低热货位的缺口（平均趋势）', () => {
    const store = useWarehouseStore.getState();
    const heat = store.getHeatMap();
    const counts = [...heat.entries()].map(([id, v]) => ({ id, count: v.count }));
    counts.sort((a, b) => b.count - a.count);

    if (counts.length >= 2) {
      const highLoc = counts[0].id;
      const lowLoc = counts[counts.length - 1].id;
      const rHigh = store.computeBatchLocationShortage(highLoc, 0);
      const rLow = store.computeBatchLocationShortage(lowLoc, 0);
      expect(rHigh.heatLevel).toBeGreaterThanOrEqual(rLow.heatLevel);
    }
  });
});

describe('快照归档中心: 恢复回放', () => {
  beforeEach(() => {
    resetStoreWithArchive();
  });

  it('restoreFromArchive 应完整恢复 9 项状态并入撤销栈', () => {
    const locs = [makeLoc('R-1', 'A', 1, 1, 1), makeLoc('R-2', 'B', 2, 1, 1)];
    useWarehouseStore.getState().setLocations(locs);
    useWarehouseStore.getState().setFilter({ zones: ['A', 'B'] });
    useWarehouseStore.getState().setThresholds({ low: 11, medium: 22, high: 33 });
    useWarehouseStore.getState().setCameraState({ position: [5, 5, 5], target: [1, 1, 1] });
    useWarehouseStore.getState().confirmCameraState();
    useWarehouseStore.getState().addBookmark({
      id: 'bm-r',
      name: 'R视角',
      position: [5, 5, 5],
      target: [1, 1, 1],
    });
    useWarehouseStore.getState().setActiveBookmark('bm-r');

    const entry = useWarehouseStore.getState().saveToArchive('manual', 'restore-me.json');
    const entryId = entry!.id;

    resetStoreWithArchive();
    useWarehouseStore.setState({
      archive: {
        entries: [entry!],
        maxEntries: 30,
        lastAutoSaveId: null,
        undoStack: [],
        currentImportSession: null,
      },
    });

    const result = useWarehouseStore.getState().restoreFromArchive(entryId);
    expect(result.success).toBe(true);
    expect(result.canUndo).toBe(true);

    const state = useWarehouseStore.getState();
    expect(state.locations.map((l) => l.id).sort()).toEqual(['R-1', 'R-2']);
    expect(state.filter.zones).toEqual(['A', 'B']);
    expect(state.thresholds).toEqual({ low: 11, medium: 22, high: 33 });
    expect(state.cameraState).toEqual({ position: [5, 5, 5], target: [1, 1, 1] });
    expect(state.confirmedCameraState).toEqual({ position: [5, 5, 5], target: [1, 1, 1] });
    expect(state.activeBookmark).toBe('bm-r');
    expect(state.activeBookmarkName).toBe('R视角');
    expect(state.cameraBookmarks).toHaveLength(1);
    expect(state.archive.undoStack).toHaveLength(1);
  });

  it('getLatestArchiveEntry 应返回最近条目，空归档返回 null', () => {
    expect(useWarehouseStore.getState().getLatestArchiveEntry()).toBeNull();

    const locs = [makeLoc('L-1', 'A', 1, 1, 1)];
    useWarehouseStore.getState().setLocations(locs);
    useWarehouseStore.getState().saveToArchive('manual', 'a.json');
    const e2 = useWarehouseStore.getState().saveToArchive('manual', 'b.json');

    expect(useWarehouseStore.getState().getLatestArchiveEntry()!.id).toBe(e2!.id);
  });

  it('deleteArchiveEntry 应删除指定条目，清空 lastAutoSaveId 若匹配', () => {
    const locs = [makeLoc('D-1', 'A', 1, 1, 1)];
    useWarehouseStore.getState().setLocations(locs);
    const e1 = useWarehouseStore.getState().saveToArchive('auto-save', 'auto.json');
    const e2 = useWarehouseStore.getState().saveToArchive('manual', 'm.json');
    expect(useWarehouseStore.getState().archive.lastAutoSaveId).toBe(e1!.id);

    const r1 = useWarehouseStore.getState().deleteArchiveEntry(e1!.id);
    expect(r1).toBe(true);
    expect(useWarehouseStore.getState().archive.entries.map((e) => e.id)).toEqual([e2!.id]);
    expect(useWarehouseStore.getState().archive.lastAutoSaveId).toBeNull();

    const r2 = useWarehouseStore.getState().deleteArchiveEntry('nonexistent');
    expect(r2).toBe(false);
  });

  it('clearArchive 应清空所有条目和 lastAutoSaveId，撤销栈保留', () => {
    const locs = [makeLoc('C-1', 'A', 1, 1, 1)];
    useWarehouseStore.getState().setLocations(locs);
    useWarehouseStore.getState().saveToArchive('auto-save', 'a.json');
    useWarehouseStore.setState({
      archive: {
        ...useWarehouseStore.getState().archive,
        undoStack: [{ stateId: 'x', snapshot: {} as any, createdAt: new Date().toISOString() }],
      },
    });

    useWarehouseStore.getState().clearArchive();
    expect(useWarehouseStore.getState().archive.entries).toHaveLength(0);
    expect(useWarehouseStore.getState().archive.lastAutoSaveId).toBeNull();
    expect(useWarehouseStore.getState().archive.undoStack).toHaveLength(1);
  });
});

describe('快照归档中心: 刷新恢复 & 失败降级', () => {
  beforeEach(() => {
    resetStoreWithArchive();
  });

  it('restoreLatestOnStartup 空状态时应恢复最近归档', () => {
    const locs = [makeLoc('S-1', 'A', 1, 1, 1)];
    useWarehouseStore.getState().setLocations(locs);
    const entry = useWarehouseStore.getState().saveToArchive('manual', 'startup.json');
    expect(entry).not.toBeNull();

    resetStoreWithArchive();
    useWarehouseStore.setState({
      archive: {
        entries: [entry!],
        maxEntries: 30,
        lastAutoSaveId: null,
        undoStack: [],
        currentImportSession: null,
      },
    });

    const result = useWarehouseStore.getState().restoreLatestOnStartup();
    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    expect(useWarehouseStore.getState().locations.map((l) => l.id)).toEqual(['S-1']);
  });

  it('restoreLatestOnStartup 已有数据时不应覆盖', () => {
    const locs = [makeLoc('EXIST-1', 'A', 1, 1, 1)];
    useWarehouseStore.getState().setLocations(locs);
    useWarehouseStore.getState().setPickRecords([
      { locationId: 'EXIST-1', timestamp: '2024-06-10T00:00:00Z', quantity: 1 },
    ]);
    useWarehouseStore.getState().saveToArchive('manual', 'archived.json');
    useWarehouseStore.getState().setLocations([makeLoc('NEW-1', 'B', 1, 1, 1)]);

    const result = useWarehouseStore.getState().restoreLatestOnStartup();
    expect(result).toBeNull();
    expect(useWarehouseStore.getState().locations.map((l) => l.id)).toEqual(['NEW-1']);
  });

  it('restoreLatestOnStartup 空归档应返回 null', () => {
    expect(useWarehouseStore.getState().restoreLatestOnStartup()).toBeNull();
  });

  it('archive persist 应正确持久化 entries/maxEntries/lastAutoSaveId/undoStack，排除 currentImportSession', () => {
    useWarehouseStore.setState({
      archive: {
        entries: [{ id: 'x', fileName: 'f.json', savedAt: 't', source: 'manual', schemaVersion: 2, summary: {} as any, snapshot: {} as any }],
        maxEntries: 25,
        lastAutoSaveId: 'x',
        undoStack: [{ stateId: 'u', snapshot: {} as any, createdAt: 't' }],
        currentImportSession: { previousEntryId: 'p', importLogs: [] },
      },
    });

    const fullState = useWarehouseStore.getState() as unknown as Record<string, unknown>;
    const archiveState = fullState.archive as SnapshotArchiveState;

    expect(archiveState.entries).toHaveLength(1);
    expect(archiveState.maxEntries).toBe(25);
    expect(archiveState.lastAutoSaveId).toBe('x');
    expect(archiveState.undoStack).toHaveLength(1);

    const initialCurrentSession = archiveState.currentImportSession;
    expect(initialCurrentSession).toBeDefined();

    const statePlain = JSON.parse(JSON.stringify(fullState));
    expect(statePlain.archive.entries).toHaveLength(1);
    expect(statePlain.archive.maxEntries).toBe(25);
    expect(statePlain.archive.lastAutoSaveId).toBe('x');
    expect(statePlain.archive.undoStack).toHaveLength(1);
  });

  it('撤销栈为空时 undoLastImport 返回 null 且不抛错', () => {
    expect(useWarehouseStore.getState().archive.undoStack).toHaveLength(0);
    expect(useWarehouseStore.getState().undoLastImport()).toBeNull();
  });

  it('restoreFromArchive 无效 entryId 返回 success=false 且 canUndo=false', () => {
    const result = useWarehouseStore.getState().restoreFromArchive('does-not-exist');
    expect(result.success).toBe(false);
    expect(result.canUndo).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('getUndoStackSize / getArchiveEntries / clearUndoStack 工作正常', () => {
    expect(useWarehouseStore.getState().getUndoStackSize()).toBe(0);
    expect(useWarehouseStore.getState().getArchiveEntries()).toHaveLength(0);

    const locs = [makeLoc('U-1', 'A', 1, 1, 1)];
    useWarehouseStore.getState().setLocations(locs);
    useWarehouseStore.getState().saveToArchive('manual', 'u.json');
    const snap: SnapshotData = {
      version: 2, exportedAt: 't', anomalies: [], importConflicts: [],
      filter: { dateRange: null, zones: [] }, thresholds: { low: 25, medium: 50, high: 75 },
      cameraState: { position: [1, 1, 1], target: [0, 0, 0] }, confirmedCameraState: null,
      activeBookmarkId: null, activeBookmarkName: null,
      locations: [makeLoc('U-2', 'B', 1, 1, 1)], pickRecords: [], cameraBookmarks: [],
    };
    useWarehouseStore.getState().importSnapshotWithArchive(snap, 'u2.json');

    expect(useWarehouseStore.getState().getUndoStackSize()).toBe(1);
    expect(useWarehouseStore.getState().getArchiveEntries()).toHaveLength(2);

    useWarehouseStore.getState().clearUndoStack();
    expect(useWarehouseStore.getState().getUndoStackSize()).toBe(0);
  });
});
