import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWarehouseStore } from '@/store/warehouseStore';
import type {
  Location,
  PickRecord,
  CongestionPlan,
  CongestionExportData,
  PlanPriority,
  PlanSource,
  CongestionConflictType,
  ShiftType,
} from '@/types/warehouse';

function makeLoc(id: string, zone: string, row: number, col: number, layer: number): Location {
  return { id, zone, row, col, layer, x: col * 3, y: layer * 3, z: row * 3 };
}

function makePickRecords(locations: Location[], count: number): PickRecord[] {
  const records: PickRecord[] = [];
  for (let i = 0; i < count; i++) {
    const loc = locations[i % locations.length];
    records.push({
      locationId: loc.id,
      timestamp: `2024-03-${String((i % 28) + 1).padStart(2, '0')}T08:00:00Z`,
      quantity: Math.floor(Math.random() * 10) + 1,
    });
  }
  return records;
}

describe('拥堵推演台: 拥堵检测', () => {
  beforeEach(() => {
    const locations: Location[] = [];
    for (let row = 1; row <= 3; row++) {
      for (let col = 1; col <= 5; col++) {
        for (let layer = 1; layer <= 2; layer++) {
          locations.push(makeLoc(`A-${row}-${col}-${layer}`, 'A', row, col, layer));
        }
      }
    }
    const pickRecords = makePickRecords(locations, 100);

    useWarehouseStore.setState({
      locations,
      pickRecords,
      anomalies: [],
      importConflicts: [],
      filter: { dateRange: null, zones: [] },
      thresholds: { low: 25, medium: 50, high: 75 },
      congestion: {
        plans: [],
        activePlanId: null,
        comparePlanId: null,
        filter: {
          shift: 'all',
          timeRange: null,
          zones: [],
          minCongestionLevel: 10,
        },
        selectedHotspotIds: [],
        conflicts: [],
        actionLogs: [],
        undoStack: [],
        nextPlanNo: 1,
        autoSaveEnabled: false,
        lastAutoSavedAt: null,
        importSession: null,
        showComparison: false,
      },
    });
  });

  it('detectCongestionHotspots 应返回拥堵热区列表', () => {
    const hotspots = useWarehouseStore.getState().detectCongestionHotspots();
    expect(Array.isArray(hotspots)).toBe(true);
    expect(hotspots.length).toBeGreaterThan(0);
    for (const hotspot of hotspots) {
      expect(hotspot.id).toBeDefined();
      expect(typeof hotspot.severity).toBe('number');
      expect(hotspot.severity).toBeGreaterThanOrEqual(0);
      expect(hotspot.severity).toBeLessThanOrEqual(100);
      expect(Array.isArray(hotspot.affectedLocationIds)).toBe(true);
    }
  });

  it('设置最低严重度阈值后应只返回超过阈值的热区', () => {
    useWarehouseStore.getState().setCongestionFilter({ minCongestionLevel: 80 });
    const hotspots = useWarehouseStore.getState().detectCongestionHotspots();
    for (const hotspot of hotspots) {
      expect(hotspot.severity).toBeGreaterThanOrEqual(80);
    }
  });

  it('按区域筛选应只返回指定区域的热区', () => {
    const locB: Location[] = [];
    for (let row = 1; row <= 2; row++) {
      for (let col = 1; col <= 3; col++) {
        locB.push(makeLoc(`B-${row}-${col}-1`, 'B', row, col, 1));
      }
    }
    const allLocs = [...useWarehouseStore.getState().locations, ...locB];
    const allPicks = [...useWarehouseStore.getState().pickRecords, ...makePickRecords(locB, 30)];
    useWarehouseStore.setState({ locations: allLocs, pickRecords: allPicks });

    useWarehouseStore.getState().setCongestionFilter({ zones: ['B'] });
    const hotspots = useWarehouseStore.getState().detectCongestionHotspots();
    for (const hotspot of hotspots) {
      expect(hotspot.zone).toBe('B');
    }
  });
});

describe('拥堵推演台: 方案生成与管理', () => {
  beforeEach(() => {
    const locations: Location[] = [];
    for (let row = 1; row <= 4; row++) {
      for (let col = 1; col <= 6; col++) {
        for (let layer = 1; layer <= 2; layer++) {
          locations.push(makeLoc(`A-${row}-${col}-${layer}`, 'A', row, col, layer));
        }
      }
    }
    const pickRecords = makePickRecords(locations, 150);

    useWarehouseStore.setState({
      locations,
      pickRecords,
      congestion: {
        plans: [],
        activePlanId: null,
        comparePlanId: null,
        filter: {
          shift: 'all',
          timeRange: null,
          zones: [],
          minCongestionLevel: 20,
        },
        selectedHotspotIds: [],
        conflicts: [],
        actionLogs: [],
        undoStack: [],
        nextPlanNo: 1,
        autoSaveEnabled: false,
        lastAutoSavedAt: null,
        importSession: null,
        showComparison: false,
      },
    });
  });

  it('generateCongestionPlans 应生成指定数量的方案', () => {
    const plans = useWarehouseStore.getState().generateCongestionPlans({ count: 3 });
    expect(plans).toHaveLength(3);
    expect(useWarehouseStore.getState().congestion.plans).toHaveLength(3);

    for (const plan of plans) {
      expect(plan.id).toBeDefined();
      expect(plan.planNo).toBeDefined();
      expect(plan.name).toBeDefined();
      expect(Array.isArray(plan.route)).toBe(true);
      expect(Array.isArray(plan.hotspots)).toBe(true);
      expect(Array.isArray(plan.affectedLocations)).toBe(true);
      expect(plan.metrics).toBeDefined();
      expect(plan.metrics.estimatedThroughputGain).toBeGreaterThan(0);
    }
  });

  it('生成的方案编号应递增且唯一', () => {
    const plans1 = useWarehouseStore.getState().generateCongestionPlans({ count: 2 });
    const plans2 = useWarehouseStore.getState().generateCongestionPlans({ count: 2 });
    const allNos = [...plans1, ...plans2].map((p) => p.planNo);
    const uniqueNos = new Set(allNos);
    expect(uniqueNos.size).toBe(4);
    expect(useWarehouseStore.getState().congestion.nextPlanNo).toBe(5);
  });

  it('createCongestionPlan 应手动创建方案', () => {
    const plan = useWarehouseStore.getState().createCongestionPlan({
      name: '测试方案',
      priority: 'high',
      source: 'manual',
    });
    expect(plan).not.toBeNull();
    expect(plan!.name).toBe('测试方案');
    expect(plan!.priority).toBe('high');
    expect(plan!.source).toBe('manual');
    expect(useWarehouseStore.getState().congestion.plans).toHaveLength(1);
  });

  it('updateCongestionPlan 应更新方案属性', () => {
    const plan = useWarehouseStore.getState().createCongestionPlan({ name: '原名称' });
    expect(plan).not.toBeNull();

    useWarehouseStore.getState().updateCongestionPlan(plan!.id, {
      name: '新名称',
      priority: 'critical',
      notes: '测试备注',
    });

    const updated = useWarehouseStore.getState().congestion.plans.find((p) => p.id === plan!.id);
    expect(updated?.name).toBe('新名称');
    expect(updated?.priority).toBe('critical');
    expect(updated?.notes).toBe('测试备注');
  });

  it('deleteCongestionPlan 应删除指定方案', () => {
    const plan = useWarehouseStore.getState().createCongestionPlan();
    expect(plan).not.toBeNull();
    expect(useWarehouseStore.getState().congestion.plans).toHaveLength(1);

    useWarehouseStore.getState().deleteCongestionPlan(plan!.id);
    expect(useWarehouseStore.getState().congestion.plans).toHaveLength(0);
  });

  it('setActiveCongestionPlan 应设置活动方案', () => {
    const plan = useWarehouseStore.getState().createCongestionPlan();
    expect(plan).not.toBeNull();

    useWarehouseStore.getState().setActiveCongestionPlan(plan!.id);
    expect(useWarehouseStore.getState().congestion.activePlanId).toBe(plan!.id);

    useWarehouseStore.getState().setActiveCongestionPlan(null);
    expect(useWarehouseStore.getState().congestion.activePlanId).toBeNull();
  });

  it('getCongestionPlansInPriorityOrder 应按优先级排序', () => {
    useWarehouseStore.getState().createCongestionPlan({ name: '低优', priority: 'low' });
    useWarehouseStore.getState().createCongestionPlan({ name: '紧急', priority: 'critical' });
    useWarehouseStore.getState().createCongestionPlan({ name: '高优', priority: 'high' });

    const ordered = useWarehouseStore.getState().getCongestionPlansInPriorityOrder();
    expect(ordered).toHaveLength(3);
    expect(ordered[0].priority).toBe('critical');
    expect(ordered[1].priority).toBe('high');
    expect(ordered[2].priority).toBe('low');
  });

  it('lockLocationInPlan / unlockLocationInPlan 应锁定和解锁货位', () => {
    const plan = useWarehouseStore.getState().createCongestionPlan();
    expect(plan).not.toBeNull();
    expect(plan!.affectedLocations.length).toBeGreaterThan(0);

    const locId = plan!.affectedLocations[0].locationId;
    useWarehouseStore.getState().lockLocationInPlan(plan!.id, locId);

    const updatedPlan = useWarehouseStore.getState().congestion.plans.find((p) => p.id === plan!.id);
    const loc = updatedPlan?.affectedLocations.find((l) => l.locationId === locId);
    expect(loc?.locked).toBe(true);
    expect(updatedPlan?.lockedLocationIds).toContain(locId);

    useWarehouseStore.getState().unlockLocationInPlan(plan!.id, locId);
    const updatedPlan2 = useWarehouseStore.getState().congestion.plans.find((p) => p.id === plan!.id);
    const loc2 = updatedPlan2?.affectedLocations.find((l) => l.locationId === locId);
    expect(loc2?.locked).toBe(false);
    expect(updatedPlan2?.lockedLocationIds).not.toContain(locId);
  });

  it('adjustCongestionPlanPriority 应调整方案优先级', () => {
    const plan = useWarehouseStore.getState().createCongestionPlan({ priority: 'medium' });
    expect(plan).not.toBeNull();

    useWarehouseStore.getState().adjustCongestionPlanPriority(plan!.id, 'high');
    const updated = useWarehouseStore.getState().congestion.plans.find((p) => p.id === plan!.id);
    expect(updated?.priority).toBe('high');
  });
});

describe('拥堵推演台: 撤销功能', () => {
  beforeEach(() => {
    const locations: Location[] = [];
    for (let row = 1; row <= 3; row++) {
      for (let col = 1; col <= 4; col++) {
        locations.push(makeLoc(`A-${row}-${col}-1`, 'A', row, col, 1));
      }
    }
    const pickRecords = makePickRecords(locations, 80);

    useWarehouseStore.setState({
      locations,
      pickRecords,
      congestion: {
        plans: [],
        activePlanId: null,
        comparePlanId: null,
        filter: { shift: 'all', timeRange: null, zones: [], minCongestionLevel: 20 },
        selectedHotspotIds: [],
        conflicts: [],
        actionLogs: [],
        undoStack: [],
        nextPlanNo: 1,
        autoSaveEnabled: false,
        lastAutoSavedAt: null,
        importSession: null,
        showComparison: false,
      },
    });
  });

  it('创建方案后可撤销', () => {
    useWarehouseStore.getState().createCongestionPlan({ name: '方案A' });
    expect(useWarehouseStore.getState().congestion.plans).toHaveLength(1);
    expect(useWarehouseStore.getState().getCongestionUndoStackSize()).toBe(1);

    useWarehouseStore.getState().undoLastCongestionAction();
    expect(useWarehouseStore.getState().congestion.plans).toHaveLength(0);
    expect(useWarehouseStore.getState().getCongestionUndoStackSize()).toBe(0);
  });

  it('删除方案后可撤销恢复', () => {
    const plan = useWarehouseStore.getState().createCongestionPlan({ name: '方案B' });
    expect(plan).not.toBeNull();

    useWarehouseStore.getState().deleteCongestionPlan(plan!.id);
    expect(useWarehouseStore.getState().congestion.plans).toHaveLength(0);

    useWarehouseStore.getState().undoLastCongestionAction();
    expect(useWarehouseStore.getState().congestion.plans).toHaveLength(1);
    expect(useWarehouseStore.getState().congestion.plans[0].name).toBe('方案B');
  });

  it('批量操作后可一次性撤销', () => {
    useWarehouseStore.getState().generateCongestionPlans({ count: 3 });
    const planCountBefore = useWarehouseStore.getState().congestion.plans.length;
    expect(planCountBefore).toBe(3);

    useWarehouseStore.getState().clearCongestionPlans();
    expect(useWarehouseStore.getState().congestion.plans).toHaveLength(0);

    useWarehouseStore.getState().undoLastCongestionAction();
    expect(useWarehouseStore.getState().congestion.plans).toHaveLength(planCountBefore);
  });

  it('撤销栈空时不应报错', () => {
    expect(useWarehouseStore.getState().getCongestionUndoStackSize()).toBe(0);
    const result = useWarehouseStore.getState().undoLastCongestionAction();
    expect(result).toBeNull();
  });
});

describe('拥堵推演台: 导入导出与冲突处理', () => {
  beforeEach(() => {
    const locations: Location[] = [];
    for (let row = 1; row <= 3; row++) {
      for (let col = 1; col <= 4; col++) {
        locations.push(makeLoc(`A-${row}-${col}-1`, 'A', row, col, 1));
      }
    }
    const pickRecords = makePickRecords(locations, 80);

    useWarehouseStore.setState({
      locations,
      pickRecords,
      congestion: {
        plans: [],
        activePlanId: null,
        comparePlanId: null,
        filter: { shift: 'all', timeRange: null, zones: [], minCongestionLevel: 20 },
        selectedHotspotIds: [],
        conflicts: [],
        actionLogs: [],
        undoStack: [],
        nextPlanNo: 1,
        autoSaveEnabled: false,
        lastAutoSavedAt: null,
        importSession: null,
        showComparison: false,
      },
    });
  });

  it('导入有效方案数据应成功', () => {
    const plan = useWarehouseStore.getState().createCongestionPlan({ name: '导出方案' });
    expect(plan).not.toBeNull();

    const exportData: CongestionExportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      plans: [plan!],
      summary: {
        totalPlans: 1,
        statusBreakdown: { draft: 1, reviewing: 0, approved: 0, rejected: 0, archived: 0 },
        priorityBreakdown: { critical: 0, high: 0, medium: 1, low: 0 },
        totalHotspots: plan!.hotspots.length,
        totalAffectedLocations: plan!.affectedLocations.length,
      },
    };

    useWarehouseStore.setState({ congestion: { ...useWarehouseStore.getState().congestion, plans: [] } });
    expect(useWarehouseStore.getState().congestion.plans).toHaveLength(0);

    const result = useWarehouseStore.getState().importCongestionPlans(exportData);
    expect(result.success).toBe(true);
    expect(result.importedPlans).toBe(1);
    expect(useWarehouseStore.getState().congestion.plans).toHaveLength(1);
  });

  it('导入重名方案应自动重命名并记录冲突', () => {
    useWarehouseStore.getState().createCongestionPlan({ name: '重复方案' });
    const existingPlan = useWarehouseStore.getState().congestion.plans[0];

    const exportData: CongestionExportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      plans: [{ ...existingPlan, id: 'imported-1', planNo: 'CON-002' }],
      summary: {
        totalPlans: 1,
        statusBreakdown: { draft: 1, reviewing: 0, approved: 0, rejected: 0, archived: 0 },
        priorityBreakdown: { critical: 0, high: 0, medium: 1, low: 0 },
        totalHotspots: 0,
        totalAffectedLocations: 0,
      },
    };

    const result = useWarehouseStore.getState().importCongestionPlans(exportData);
    expect(result.importedPlans).toBe(1);

    const nameConflict = result.conflicts.find(
      (c) => c.type === ('duplicate_plan_name' as CongestionConflictType)
    );
    expect(nameConflict).toBeDefined();
    expect(nameConflict?.resolution).toBe('rename');
  });

  it('导入缺失必填字段的方案应降级处理', () => {
    const incompletePlan = {
      id: 'bad-plan',
      planNo: 'BAD-001',
      name: '不完整方案',
    };

    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      plans: [incompletePlan],
    };

    const result = useWarehouseStore.getState().importCongestionPlans(exportData);
    expect(result.importedPlans).toBeGreaterThanOrEqual(0);
    const missingFieldConflict = result.conflicts.find(
      (c) => c.type === ('missing_required_field' as CongestionConflictType)
    );
    expect(missingFieldConflict).toBeDefined();
  });

  it('导入版本不匹配的数据应以兼容模式处理', () => {
    const exportData = {
      version: 999,
      exportedAt: new Date().toISOString(),
      plans: [],
    };

    const result = useWarehouseStore.getState().importCongestionPlans(exportData);
    const versionConflict = result.conflicts.find(
      (c) => c.type === ('version_mismatch' as CongestionConflictType)
    );
    expect(versionConflict).toBeDefined();
  });

  it('导入后可撤销整个导入操作', () => {
    const plan = useWarehouseStore.getState().createCongestionPlan({ name: '导入测试' });
    const exportData: CongestionExportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      plans: [plan!],
      summary: {
        totalPlans: 1,
        statusBreakdown: { draft: 1, reviewing: 0, approved: 0, rejected: 0, archived: 0 },
        priorityBreakdown: { critical: 0, high: 0, medium: 1, low: 0 },
        totalHotspots: 0,
        totalAffectedLocations: 0,
      },
    };

    useWarehouseStore.setState({ congestion: { ...useWarehouseStore.getState().congestion, plans: [] } });
    useWarehouseStore.getState().importCongestionPlans(exportData);
    expect(useWarehouseStore.getState().congestion.plans.length).toBeGreaterThan(0);

    useWarehouseStore.getState().undoLastCongestionAction();
    expect(useWarehouseStore.getState().congestion.plans).toHaveLength(0);
  });

  it('导入无效JSON应返回失败结果', () => {
    const result = useWarehouseStore.getState().importCongestionPlans(null);
    expect(result.success).toBe(false);
  });
});

describe('拥堵推演台: 对比模式', () => {
  beforeEach(() => {
    const locations: Location[] = [];
    for (let row = 1; row <= 3; row++) {
      for (let col = 1; col <= 4; col++) {
        locations.push(makeLoc(`A-${row}-${col}-1`, 'A', row, col, 1));
      }
    }
    const pickRecords = makePickRecords(locations, 80);

    useWarehouseStore.setState({
      locations,
      pickRecords,
      congestion: {
        plans: [],
        activePlanId: null,
        comparePlanId: null,
        filter: { shift: 'all', timeRange: null, zones: [], minCongestionLevel: 20 },
        selectedHotspotIds: [],
        conflicts: [],
        actionLogs: [],
        undoStack: [],
        nextPlanNo: 1,
        autoSaveEnabled: false,
        lastAutoSavedAt: null,
        importSession: null,
        showComparison: false,
      },
    });
  });

  it('toggleCongestionComparison 应切换对比模式', () => {
    expect(useWarehouseStore.getState().congestion.showComparison).toBe(false);
    useWarehouseStore.getState().toggleCongestionComparison();
    expect(useWarehouseStore.getState().congestion.showComparison).toBe(true);
    useWarehouseStore.getState().toggleCongestionComparison();
    expect(useWarehouseStore.getState().congestion.showComparison).toBe(false);
  });

  it('setCompareCongestionPlan 应设置对比方案', () => {
    const plan = useWarehouseStore.getState().createCongestionPlan();
    expect(plan).not.toBeNull();

    useWarehouseStore.getState().setCompareCongestionPlan(plan!.id);
    expect(useWarehouseStore.getState().congestion.comparePlanId).toBe(plan!.id);

    useWarehouseStore.getState().setCompareCongestionPlan(null);
    expect(useWarehouseStore.getState().congestion.comparePlanId).toBeNull();
  });
});

describe('拥堵推演台: 操作日志', () => {
  beforeEach(() => {
    const locations: Location[] = [];
    for (let row = 1; row <= 2; row++) {
      for (let col = 1; col <= 3; col++) {
        locations.push(makeLoc(`A-${row}-${col}-1`, 'A', row, col, 1));
      }
    }
    const pickRecords = makePickRecords(locations, 50);

    useWarehouseStore.setState({
      locations,
      pickRecords,
      congestion: {
        plans: [],
        activePlanId: null,
        comparePlanId: null,
        filter: { shift: 'all', timeRange: null, zones: [], minCongestionLevel: 20 },
        selectedHotspotIds: [],
        conflicts: [],
        actionLogs: [],
        undoStack: [],
        nextPlanNo: 1,
        autoSaveEnabled: false,
        lastAutoSavedAt: null,
        importSession: null,
        showComparison: false,
      },
    });
  });

  it('创建方案应产生操作日志', () => {
    useWarehouseStore.getState().createCongestionPlan({ name: '日志测试' });
    const logs = useWarehouseStore.getState().congestion.actionLogs;
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].action).toBeDefined();
    expect(logs[0].description).toBeDefined();
    expect(logs[0].timestamp).toBeDefined();
  });

  it('clearCongestionLogs 应清空日志', () => {
    useWarehouseStore.getState().createCongestionPlan();
    expect(useWarehouseStore.getState().congestion.actionLogs.length).toBeGreaterThan(0);

    useWarehouseStore.getState().clearCongestionLogs();
    expect(useWarehouseStore.getState().congestion.actionLogs).toHaveLength(0);
  });
});

describe('拥堵推演台: 筛选条件持久化', () => {
  beforeEach(() => {
    const locations: Location[] = [makeLoc('A-1-1-1', 'A', 1, 1, 1)];
    useWarehouseStore.setState({
      locations,
      pickRecords: [],
      congestion: {
        plans: [],
        activePlanId: null,
        comparePlanId: null,
        filter: { shift: 'all', timeRange: null, zones: [], minCongestionLevel: 30 },
        selectedHotspotIds: [],
        conflicts: [],
        actionLogs: [],
        undoStack: [],
        nextPlanNo: 1,
        autoSaveEnabled: true,
        lastAutoSavedAt: null,
        importSession: null,
        showComparison: false,
      },
    });
  });

  it('setCongestionFilter 应更新筛选条件', () => {
    useWarehouseStore.getState().setCongestionFilter({ shift: 'morning' });
    expect(useWarehouseStore.getState().congestion.filter.shift).toBe('morning');

    useWarehouseStore.getState().setCongestionFilter({ minCongestionLevel: 50 });
    expect(useWarehouseStore.getState().congestion.filter.minCongestionLevel).toBe(50);

    useWarehouseStore.getState().setCongestionFilter({ zones: ['A', 'B'] });
    expect(useWarehouseStore.getState().congestion.filter.zones).toEqual(['A', 'B']);
  });

  it('部分更新筛选条件不应影响其他字段', () => {
    useWarehouseStore.getState().setCongestionFilter({ shift: 'night', minCongestionLevel: 60 });
    expect(useWarehouseStore.getState().congestion.filter.shift).toBe('night');
    expect(useWarehouseStore.getState().congestion.filter.minCongestionLevel).toBe(60);
    expect(useWarehouseStore.getState().congestion.filter.zones).toEqual([]);
  });
});

const STORAGE_KEY_PERSIST = 'warehouse-heatmap-store';
const STORAGE_KEY_DRAFT = 'congestion-draft';

const fs: typeof import('fs') = require('fs');
const path: typeof import('path') = require('path');
const STORE_SRC = fs.readFileSync(
  path.resolve(__dirname, '..', 'store', 'warehouseStore.ts'),
  'utf-8'
);

function assertPersistPartializeContains(needle: string) {
  expect(STORE_SRC).toContain(needle);
}

function applyManualPersistPartialize(state: ReturnType<typeof useWarehouseStore.getState>) {
  const undoCount = Math.min(5, state.congestion.undoStack.length);
  return {
    ...state,
    congestion: {
      ...state.congestion,
      plans: state.congestion.plans,
      activePlanId: state.congestion.activePlanId,
      comparePlanId: state.congestion.comparePlanId,
      showComparison: state.congestion.showComparison,
      filter: state.congestion.filter,
      conflicts: state.congestion.conflicts,
      undoStack: state.congestion.undoStack.slice(0, undoCount),
      nextPlanNo: state.congestion.nextPlanNo,
      autoSaveEnabled: state.congestion.autoSaveEnabled,
      selectedHotspotIds: [],
      actionLogs: [],
    },
  };
}

function makeCongestionTestLocations(): Location[] {
  const locs: Location[] = [];
  for (let row = 1; row <= 4; row++) {
    for (let col = 1; col <= 6; col++) {
      for (let layer = 1; layer <= 2; layer++) {
        locs.push(makeLoc(`Z-${row}-${col}-${layer}`, 'Z', row, col, layer));
      }
    }
  }
  return locs;
}

function seedCongestionPlansToStore(): {
  planAId: string;
  planBId: string;
  activePlanId: string;
  comparePlanId: string;
  filter: { shift: ShiftType; zones: string[]; minCongestionLevel: number; timeRange: null };
} {
  const locs = makeCongestionTestLocations();
  const picks = makePickRecords(locs, 200);

  useWarehouseStore.setState({
    locations: locs,
    pickRecords: picks,
    anomalies: [],
    importConflicts: [],
    filter: { dateRange: null, zones: [] },
    thresholds: { low: 25, medium: 50, high: 75 },
  });

  useWarehouseStore.getState().setCongestionFilter({
    shift: 'morning',
    zones: ['Z'],
    minCongestionLevel: 5,
    timeRange: null,
  });

  const generatedPlans = useWarehouseStore.getState().generateCongestionPlans({ count: 2 });
  let planAId: string;
  let planBId: string;

  if (generatedPlans.length >= 2) {
    planAId = generatedPlans[0].id;
    planBId = generatedPlans[1].id;
  } else {
    const now = new Date().toISOString();
    const fallbackPlanA: CongestionPlan = {
      id: 'fallback-plan-a',
      name: '方案A',
      priority: 'high',
      source: 'manual',
      lockedLocationIds: [],
      relocationTargets: [],
      score: 80,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    const fallbackPlanB: CongestionPlan = {
      id: 'fallback-plan-b',
      name: '方案B',
      priority: 'medium',
      source: 'manual',
      lockedLocationIds: [],
      relocationTargets: [],
      score: 60,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    useWarehouseStore.setState((s) => ({
      congestion: {
        ...s.congestion,
        plans: [...s.congestion.plans, fallbackPlanA, fallbackPlanB],
        nextPlanNo: s.congestion.nextPlanNo + 2,
      },
    }));
    planAId = fallbackPlanA.id;
    planBId = fallbackPlanB.id;
  }

  useWarehouseStore.getState().setActiveCongestionPlan(planAId);
  useWarehouseStore.getState().setCompareCongestionPlan(planBId);
  useWarehouseStore.getState().toggleCongestionComparison();

  const filterState = useWarehouseStore.getState().congestion.filter;

  useWarehouseStore.getState().setCongestionFilter({
    zones: ['Z', 'A'],
    minCongestionLevel: 50,
  });

  useWarehouseStore.setState((s) => ({
    congestion: {
      ...s.congestion,
      selectedHotspotIds: ['hotspot-1', 'hotspot-2'],
      actionLogs: [{ id: 'log-1', timestamp: 'x', action: 'generate', description: 'y' }],
    },
  }));

  return {
    planAId,
    planBId,
    activePlanId: planAId,
    comparePlanId: planBId,
    filter: filterState,
  };
}

describe('跨模块: persist 自动恢复 vs loadCongestionDraft 手动恢复 (回归防误判)', () => {
  beforeEach(() => {
    localStorage.clear();
    useWarehouseStore.setState({
      locations: [],
      pickRecords: [],
      anomalies: [],
      importConflicts: [],
      filter: { dateRange: null, zones: [] },
      thresholds: { low: 25, medium: 50, high: 75 },
      congestion: {
        plans: [],
        activePlanId: null,
        comparePlanId: null,
        filter: { shift: 'all', timeRange: null, zones: [], minCongestionLevel: 30 },
        selectedHotspotIds: [],
        conflicts: [],
        actionLogs: [],
        undoStack: [],
        nextPlanNo: 1,
        autoSaveEnabled: true,
        lastAutoSavedAt: null,
        importSession: null,
        showComparison: false,
      },
    });
  });

  describe('场景 1: persist 自动恢复边界 - 核心拥堵状态应保留，临时编辑态不回来', () => {
    it('【防误判核心断言】即使不调用 loadCongestionDraft，源码 partialize 也会保留 plans/filter/activePlanId 等核心拥堵状态；只有 selectedHotspotIds/actionLogs 等临时态会丢', () => {
      const seed = seedCongestionPlansToStore();

      assertPersistPartializeContains('plans: state.congestion.plans');
      assertPersistPartializeContains('activePlanId: state.congestion.activePlanId');
      assertPersistPartializeContains('comparePlanId: state.congestion.comparePlanId');
      assertPersistPartializeContains('showComparison: state.congestion.showComparison');
      assertPersistPartializeContains('filter: state.congestion.filter');
      assertPersistPartializeContains('nextPlanNo: state.congestion.nextPlanNo');
      assertPersistPartializeContains('selectedHotspotIds: []');
      assertPersistPartializeContains('actionLogs: []');

      const fullState = useWarehouseStore.getState();
      const persisted = applyManualPersistPartialize(fullState);

      expect(persisted.congestion.plans).toHaveLength(2);
      expect(persisted.congestion.plans.map((p: CongestionPlan) => p.id)).toContain(seed.planAId);
      expect(persisted.congestion.activePlanId).toBe(seed.activePlanId);
      expect(persisted.congestion.comparePlanId).toBe(seed.comparePlanId);
      expect(persisted.congestion.showComparison).toBe(true);
      expect(persisted.congestion.nextPlanNo).toBeGreaterThanOrEqual(3);
      expect(persisted.congestion.filter.zones).toEqual(['Z', 'A']);
      expect(persisted.congestion.filter.minCongestionLevel).toBe(50);
      expect(persisted.congestion.filter.shift).toBe('morning');
      expect(persisted.congestion.undoStack.length).toBeGreaterThanOrEqual(0);

      expect(persisted.congestion.selectedHotspotIds).toEqual([]);
      expect(persisted.congestion.actionLogs).toEqual([]);

      const simulatedPersistState: any = JSON.parse(JSON.stringify(persisted));
      simulatedPersistState.locations = makeCongestionTestLocations();
      simulatedPersistState.pickRecords = makePickRecords(simulatedPersistState.locations, 200);

      assertPersistPartializeContains('onRehydrateStorage');
      expect(simulatedPersistState.congestion.plans).toHaveLength(2);
      expect(simulatedPersistState.congestion.activePlanId).toBe(seed.activePlanId);
      expect(simulatedPersistState.congestion.showComparison).toBe(true);
      expect(simulatedPersistState.congestion.filter.zones).toEqual(['Z', 'A']);
      expect(simulatedPersistState.congestion.selectedHotspotIds).toEqual([]);
      expect(simulatedPersistState.congestion.actionLogs).toEqual([]);
    });

    it('Playback 页面启动时 persist 已自动恢复核心拥堵状态，不能误判为"所有拥堵状态都会丢"', () => {
      const seed = seedCongestionPlansToStore();
      const persisted = applyManualPersistPartialize(useWarehouseStore.getState());

      expect(persisted.congestion.plans.length).toBeGreaterThan(0);
      expect(persisted.congestion.activePlanId).not.toBeNull();
      expect(persisted.congestion.filter).toBeDefined();

      expect(persisted.congestion.plans[0].id).toBe(seed.planAId);
      expect(persisted.congestion.activePlanId).toBe(seed.activePlanId);
      expect(persisted.congestion.comparePlanId).toBe(seed.comparePlanId);
      expect(persisted.congestion.showComparison).toBe(true);
      expect(persisted.congestion.nextPlanNo).toBeGreaterThanOrEqual(3);
      expect(persisted.congestion.filter.minCongestionLevel).toBe(50);
      expect(persisted.congestion.filter.zones).toEqual(['Z', 'A']);
      expect(persisted.congestion.filter.shift).toBe('morning');

      expect(persisted.congestion.selectedHotspotIds).toEqual([]);
      expect(persisted.congestion.actionLogs).toEqual([]);
    });

    it('临时态 selectedHotspotIds 和 actionLogs 不应被 persist 恢复，确认边界', () => {
      seedCongestionPlansToStore();

      const beforeState = useWarehouseStore.getState();
      expect(beforeState.congestion.selectedHotspotIds).toEqual(['hotspot-1', 'hotspot-2']);
      expect(beforeState.congestion.actionLogs.length).toBeGreaterThan(0);

      const persisted = applyManualPersistPartialize(beforeState);

      expect(persisted.congestion.selectedHotspotIds).toEqual([]);
      expect(persisted.congestion.actionLogs).toEqual([]);

      assertPersistPartializeContains('selectedHotspotIds: []');
      assertPersistPartializeContains('actionLogs: []');
    });
  });

  describe('场景 2: Playback 侧无推演入口 - 组件源码约束验证', () => {
    it('PlaybackSidebar.tsx 源码不包含 CongestionSandbox 引用，Sidebar.tsx 必须包含，防止 UI 入口被误加', () => {
      const fs = require('fs');
      const path = require('path');
      const projectRoot = path.resolve(__dirname, '../..');

      const sidebarPath = path.join(projectRoot, 'src/components/Sidebar.tsx');
      const playbackSidebarPath = path.join(projectRoot, 'src/components/PlaybackSidebar.tsx');

      const sidebarSrc = fs.readFileSync(sidebarPath, 'utf-8');
      const playbackSidebarSrc = fs.readFileSync(playbackSidebarPath, 'utf-8');

      expect(sidebarSrc).toContain("CongestionSandbox");
      expect(sidebarSrc).toContain("<CongestionSandbox />");

      expect(playbackSidebarSrc).not.toContain("CongestionSandbox");

      expect(playbackSidebarSrc).toContain("验收回放台");
      expect(playbackSidebarSrc).toContain("DemoPresets");
      expect(sidebarSrc).not.toContain("验收回放台");
    });

    it('Playback.tsx 不应调用 loadCongestionDraft，Home.tsx 必须调用 —— 明确两条链的触发边界', () => {
      const fs = require('fs');
      const path = require('path');
      const projectRoot = path.resolve(__dirname, '../..');

      const homePath = path.join(projectRoot, 'src/pages/Home.tsx');
      const playbackPath = path.join(projectRoot, 'src/pages/Playback.tsx');

      const homeSrc = fs.readFileSync(homePath, 'utf-8');
      const playbackSrc = fs.readFileSync(playbackPath, 'utf-8');

      expect(homeSrc).toContain('loadCongestionDraft');
      expect(homeSrc).toMatch(/loadCongestionDraft\(\)/);

      expect(playbackSrc).not.toContain('loadCongestionDraft');

      expect(playbackSrc).toContain('restoreLatestOnStartup');
      expect(playbackSrc).toContain('loadReplenishmentDraft');
    });
  });

  describe('场景 3: 已有 localStorage 草稿但未显式加载 - 区分 persist 恢复与草稿恢复', () => {
    it('congestion-draft 存在但未调 loadCongestionDraft 时，store 中的 plans 以 persist 为准，草稿内容不应神秘出现', () => {
      const seed = seedCongestionPlansToStore();

      const plansSnapshot = JSON.parse(JSON.stringify(useWarehouseStore.getState().congestion.plans));
      const filterSnapshot = JSON.parse(JSON.stringify(useWarehouseStore.getState().congestion.filter));

      useWarehouseStore.getState().saveCongestionDraft();
      const draftRaw = localStorage.getItem(STORAGE_KEY_DRAFT);
      expect(draftRaw).not.toBeNull();
      const draftData = JSON.parse(draftRaw!);
      expect(draftData.plans).toHaveLength(2);
      expect(draftData.plans[0].id).toBe(seed.planAId);

      useWarehouseStore.setState({
        congestion: {
          plans: [],
          activePlanId: null,
          comparePlanId: null,
          filter: { shift: 'all', timeRange: null, zones: [], minCongestionLevel: 30 },
          selectedHotspotIds: [],
          conflicts: [],
          actionLogs: [],
          undoStack: [],
          nextPlanNo: 1,
          autoSaveEnabled: true,
          lastAutoSavedAt: null,
          importSession: null,
          showComparison: false,
        },
      });

      const stateBeforeLoad = useWarehouseStore.getState();
      expect(stateBeforeLoad.congestion.plans).toHaveLength(0);
      expect(stateBeforeLoad.congestion.activePlanId).toBeNull();
      expect(stateBeforeLoad.congestion.filter.shift).toBe('all');

      const draftStillExists = localStorage.getItem(STORAGE_KEY_DRAFT);
      expect(draftStillExists).not.toBeNull();
      const draftAfter = JSON.parse(draftStillExists!);
      expect(draftAfter.plans).toHaveLength(2);
      expect(draftAfter.plans[0].id).toBe(seed.planAId);

      expect(useWarehouseStore.getState().congestion.plans).toHaveLength(0);
    });

    it('persist 恢复的状态不等于草稿恢复的状态，两条链从不同 localStorage key 读取数据', () => {
      seedCongestionPlansToStore();

      useWarehouseStore.getState().saveCongestionDraft();

      useWarehouseStore.getState().setCongestionFilter({
        shift: 'night',
        zones: [],
        minCongestionLevel: 10,
      });

      useWarehouseStore.setState((s) => {
        const extraPlan: CongestionPlan = {
          id: 'extra-only-persist',
          name: '仅 persist 有，草稿没有',
          priority: 'low',
          source: 'manual',
          lockedLocationIds: [],
          relocationTargets: [],
          score: 20,
          status: 'draft',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 1,
        };
        return {
          congestion: {
            ...s.congestion,
            plans: [...s.congestion.plans, extraPlan],
            nextPlanNo: s.congestion.nextPlanNo + 1,
          },
        };
      });

      const persistedSnapshot = JSON.parse(JSON.stringify(applyManualPersistPartialize(useWarehouseStore.getState())));

      const draftSnapshot = JSON.parse(localStorage.getItem(STORAGE_KEY_DRAFT) || '{}');

      expect(persistedSnapshot.congestion.plans.length).toBe(3);
      expect(draftSnapshot.plans.length).toBe(2);

      expect(persistedSnapshot.congestion.filter.shift).toBe('night');
      expect(draftSnapshot.filter.shift).toBe('morning');

      expect(persistedSnapshot.congestion.filter.minCongestionLevel).toBe(10);
      expect(draftSnapshot.filter.minCongestionLevel).toBe(50);

      expect(STORAGE_KEY_PERSIST).toBe('warehouse-heatmap-store');
      expect(STORAGE_KEY_DRAFT).toBe('congestion-draft');
      expect(STORAGE_KEY_PERSIST).not.toBe(STORAGE_KEY_DRAFT);
    });
  });

  describe('场景 4: 显式加载草稿 - 对比态、活动方案、筛选状态正确回填', () => {
    it('loadCongestionDraft 应完整回填 plans / activePlanId / comparePlanId / showComparison / filter', () => {
      const seed = seedCongestionPlansToStore();
      useWarehouseStore.getState().saveCongestionDraft();

      useWarehouseStore.setState({
        congestion: {
          plans: [],
          activePlanId: null,
          comparePlanId: null,
          filter: { shift: 'all', timeRange: null, zones: [], minCongestionLevel: 30 },
          selectedHotspotIds: [],
          conflicts: [],
          actionLogs: [],
          undoStack: [],
          nextPlanNo: 999,
          autoSaveEnabled: true,
          lastAutoSavedAt: null,
          importSession: null,
          showComparison: false,
        },
      });

      const loaded = useWarehouseStore.getState().loadCongestionDraft();
      expect(loaded).toBe(true);

      const state = useWarehouseStore.getState().congestion;

      expect(state.plans).toHaveLength(2);
      expect(state.plans.map((p) => p.id)).toContain(seed.planAId);
      expect(state.plans.map((p) => p.id)).toContain(seed.planBId);

      expect(state.activePlanId).toBe(seed.activePlanId);
      expect(state.comparePlanId).toBe(seed.comparePlanId);
      expect(state.showComparison).toBe(true);

      expect(state.filter.shift).toBe('morning');
      expect(state.filter.zones).toEqual(['Z', 'A']);
      expect(state.filter.minCongestionLevel).toBe(50);
      expect(state.filter.timeRange).toBeNull();

      expect(state.nextPlanNo).toBeGreaterThanOrEqual(3);

      const lastAutoSaved = state.lastAutoSavedAt;
      expect(lastAutoSaved).not.toBeNull();
      expect(typeof lastAutoSaved).toBe('string');
    });

    it('loadCongestionDraft 返回 false 的情况: 草稿不存在 / 格式无效', () => {
      localStorage.removeItem(STORAGE_KEY_DRAFT);
      expect(useWarehouseStore.getState().loadCongestionDraft()).toBe(false);

      localStorage.setItem(STORAGE_KEY_DRAFT, 'invalid-json{{{');
      expect(useWarehouseStore.getState().loadCongestionDraft()).toBe(false);

      localStorage.setItem(STORAGE_KEY_DRAFT, JSON.stringify(null));
      expect(useWarehouseStore.getState().loadCongestionDraft()).toBe(false);

      localStorage.setItem(STORAGE_KEY_DRAFT, JSON.stringify('just a string'));
      expect(useWarehouseStore.getState().loadCongestionDraft()).toBe(false);
    });

    it('草稿 filter 缺字段时 loadCongestionDraft 应：草稿有值的字段覆盖，缺的字段填草稿构造默认值再 merge', () => {
      useWarehouseStore.getState().setCongestionFilter({
        shift: 'afternoon',
        zones: ['existing-zone'],
        minCongestionLevel: 15,
        timeRange: { start: '2024-01-01', end: '2024-06-30' },
      });

      useWarehouseStore.getState().createCongestionPlan({ name: '已有方案' });
      const existingActivePlanId = useWarehouseStore.getState().congestion.activePlanId;
      expect(existingActivePlanId).not.toBeNull();

      const partialDraft = {
        version: 1,
        savedAt: new Date().toISOString(),
        plans: [],
        nextPlanNo: 77,
        filter: {
          shift: 'night',
          zones: ['loaded-zone'],
        },
        activePlanId: null,
        showComparison: true,
        comparePlanId: null,
      };
      localStorage.setItem(STORAGE_KEY_DRAFT, JSON.stringify(partialDraft));

      useWarehouseStore.getState().loadCongestionDraft();

      const state = useWarehouseStore.getState().congestion;
      expect(state.filter.shift).toBe('night');
      expect(state.filter.zones).toEqual(['loaded-zone']);
      expect(state.filter.minCongestionLevel).toBe(30);
      expect(state.filter.timeRange).toBeNull();

      expect(state.nextPlanNo).toBe(77);
      expect(state.showComparison).toBe(true);
    });

    it('草稿完全没有 filter 字段时 loadCongestionDraft 应保留 store 原有 filter 不变', () => {
      const originalFilter = {
        shift: 'afternoon' as ShiftType,
        zones: ['keep-zone'],
        minCongestionLevel: 42,
        timeRange: { start: '2024-03-01', end: '2024-05-31' },
      };
      useWarehouseStore.getState().setCongestionFilter(originalFilter);

      const noFilterDraft = {
        version: 1,
        savedAt: new Date().toISOString(),
        plans: [],
        nextPlanNo: 55,
        activePlanId: null,
        showComparison: false,
        comparePlanId: null,
      };
      localStorage.setItem(STORAGE_KEY_DRAFT, JSON.stringify(noFilterDraft));

      useWarehouseStore.getState().loadCongestionDraft();

      const state = useWarehouseStore.getState().congestion;
      expect(state.filter).toEqual(originalFilter);
      expect(state.nextPlanNo).toBe(55);
    });
  });
});

describe('跨模块: Home vs Playback 初始化触发链验证', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('Home 页面初始化顺序: restoreLatestOnStartup → loadReplenishmentDraft → loadCongestionDraft', () => {
    const fs = require('fs');
    const path = require('path');
    const projectRoot = path.resolve(__dirname, '../..');
    const homeSrc = fs.readFileSync(path.join(projectRoot, 'src/pages/Home.tsx'), 'utf-8');

    const restoreIdx = homeSrc.indexOf('restoreLatestOnStartup');
    const replenishIdx = homeSrc.indexOf('loadReplenishmentDraft');
    const congestionIdx = homeSrc.indexOf('loadCongestionDraft');

    expect(restoreIdx).toBeGreaterThan(-1);
    expect(replenishIdx).toBeGreaterThan(-1);
    expect(congestionIdx).toBeGreaterThan(-1);

    expect(replenishIdx).toBeGreaterThan(restoreIdx);
    expect(congestionIdx).toBeGreaterThan(replenishIdx);

    const timers = homeSrc.match(/setTimeout\(/g) || [];
    expect(timers.length).toBeGreaterThanOrEqual(3);
  });

  it('Playback 页面初始化顺序: 只有 restoreLatestOnStartup + loadReplenishmentDraft，不应出现 loadCongestionDraft', () => {
    const fs = require('fs');
    const path = require('path');
    const projectRoot = path.resolve(__dirname, '../..');
    const playbackSrc = fs.readFileSync(path.join(projectRoot, 'src/pages/Playback.tsx'), 'utf-8');

    expect(playbackSrc.indexOf('restoreLatestOnStartup')).toBeGreaterThan(-1);
    expect(playbackSrc.indexOf('loadReplenishmentDraft')).toBeGreaterThan(-1);
    expect(playbackSrc.indexOf('loadCongestionDraft')).toBe(-1);

    const timers = playbackSrc.match(/setTimeout\(/g) || [];
    expect(timers.length).toBe(2);
  });
});
