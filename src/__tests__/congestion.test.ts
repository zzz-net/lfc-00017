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
