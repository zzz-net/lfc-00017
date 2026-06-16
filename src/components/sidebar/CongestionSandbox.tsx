import { useState, useRef } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Edit3,
  FileJson,
  Filter,
  GripVertical,
  Info,
  Lock,
  Plus,
  RefreshCw,
  Save,
  SplitSquareVertical,
  Trash2,
  Undo2,
  Unlock,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { useWarehouseStore } from '@/store/warehouseStore';
import type {
  CongestionPlan,
  PlanPriority,
  PlanStatus,
  PlanSource,
  CongestionConflict,
  CongestionConflictType,
  ShiftType,
} from '@/types/warehouse';

const priorityColor: Record<PlanPriority, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

const priorityLabel: Record<PlanPriority, string> = {
  critical: '紧急',
  high: '高',
  medium: '中',
  low: '低',
};

const statusLabel: Record<PlanStatus, string> = {
  draft: '草稿',
  reviewing: '审核中',
  approved: '已批准',
  rejected: '已拒绝',
  archived: '已归档',
};

const statusColor: Record<PlanStatus, string> = {
  draft: 'bg-gray-500/20 text-gray-400',
  reviewing: 'bg-blue-500/20 text-blue-400',
  approved: 'bg-green-500/20 text-green-400',
  rejected: 'bg-red-500/20 text-red-400',
  archived: 'bg-purple-500/20 text-purple-400',
};

const sourceLabel: Record<PlanSource, string> = {
  'auto-generated': '自动生成',
  manual: '手动创建',
  imported: '导入',
  template: '模板',
};

const shiftLabel: Record<ShiftType, string> = {
  all: '全部班次',
  morning: '早班',
  afternoon: '中班',
  night: '晚班',
};

const conflictTypeIcon: Record<CongestionConflictType, typeof AlertTriangle> = {
  duplicate_plan_no: FileJson,
  duplicate_plan_name: FileJson,
  missing_route_point: AlertTriangle,
  unknown_location: X,
  location_occupied: Lock,
  missing_required_field: Info,
  version_mismatch: AlertTriangle,
  invalid_route: AlertTriangle,
};

export default function CongestionSandbox() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPriority, setEditPriority] = useState<PlanPriority>('medium');
  const [editNotes, setEditNotes] = useState('');
  const [showLogs, setShowLogs] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);
  const [planCount, setPlanCount] = useState(3);
  const [showPlanCount, setShowPlanCount] = useState(false);

  const congestion = useWarehouseStore((s) => s.congestion);
  const locations = useWarehouseStore((s) => s.locations);
  const setCongestionFilter = useWarehouseStore((s) => s.setCongestionFilter);
  const detectCongestionHotspots = useWarehouseStore((s) => s.detectCongestionHotspots);
  const generateCongestionPlans = useWarehouseStore((s) => s.generateCongestionPlans);
  const createCongestionPlan = useWarehouseStore((s) => s.createCongestionPlan);
  const updateCongestionPlan = useWarehouseStore((s) => s.updateCongestionPlan);
  const deleteCongestionPlan = useWarehouseStore((s) => s.deleteCongestionPlan);
  const setActiveCongestionPlan = useWarehouseStore((s) => s.setActiveCongestionPlan);
  const setCompareCongestionPlan = useWarehouseStore((s) => s.setCompareCongestionPlan);
  const toggleCongestionComparison = useWarehouseStore((s) => s.toggleCongestionComparison);
  const lockLocationInPlan = useWarehouseStore((s) => s.lockLocationInPlan);
  const unlockLocationInPlan = useWarehouseStore((s) => s.unlockLocationInPlan);
  const adjustCongestionPlanPriority = useWarehouseStore((s) => s.adjustCongestionPlanPriority);
  const exportCongestionPlans = useWarehouseStore((s) => s.exportCongestionPlans);
  const importCongestionPlans = useWarehouseStore((s) => s.importCongestionPlans);
  const undoLastCongestionAction = useWarehouseStore((s) => s.undoLastCongestionAction);
  const getCongestionUndoStackSize = useWarehouseStore((s) => s.getCongestionUndoStackSize);
  const clearCongestionConflicts = useWarehouseStore((s) => s.clearCongestionConflicts);
  const clearCongestionPlans = useWarehouseStore((s) => s.clearCongestionPlans);
  const saveCongestionDraft = useWarehouseStore((s) => s.saveCongestionDraft);
  const loadCongestionDraft = useWarehouseStore((s) => s.loadCongestionDraft);
  const getCongestionPlansInPriorityOrder = useWarehouseStore((s) => s.getCongestionPlansInPriorityOrder);
  const setCongestionAutoSaveEnabled = useWarehouseStore((s) => s.setCongestionAutoSaveEnabled);
  const clearCongestionLogs = useWarehouseStore((s) => s.clearCongestionLogs);
  const addCongestionActionLog = useWarehouseStore((s) => s.addCongestionActionLog);

  const orderedPlans = getCongestionPlansInPriorityOrder();
  const undoSize = getCongestionUndoStackSize();
  const hotspots = detectCongestionHotspots();

  const totalStats = {
    plans: congestion.plans.length,
    hotspots: hotspots.length,
    avgSeverity: hotspots.length > 0
      ? Math.round(hotspots.reduce((s, h) => s + h.severity, 0) / hotspots.length)
      : 0,
    activePlan: congestion.activePlanId
      ? congestion.plans.find((p) => p.id === congestion.activePlanId)
      : null,
  };

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        importCongestionPlans(data);
      } catch {
        importCongestionPlans(null);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function handleGeneratePlans() {
    generateCongestionPlans({ count: planCount });
  }

  function startEdit(plan: CongestionPlan) {
    setEditingPlanId(plan.id);
    setEditName(plan.name);
    setEditPriority(plan.priority);
    setEditNotes(plan.notes || '');
  }

  function saveEdit(planId: string) {
    updateCongestionPlan(planId, { name: editName, priority: editPriority, notes: editNotes });
    setEditingPlanId(null);
  }

  function handleLockToggle(planId: string, locationId: string, locked: boolean) {
    if (locked) {
      unlockLocationInPlan(planId, locationId);
    } else {
      lockLocationInPlan(planId, locationId);
    }
  }

  const priorityOptions: PlanPriority[] = ['critical', 'high', 'medium', 'low'];
  const shiftOptions: ShiftType[] = ['all', 'morning', 'afternoon', 'night'];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Zap size={16} className="text-orange-400" />
        <h3 className="text-sm font-semibold text-orange-300">作业拥堵推演台</h3>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div className="bg-[#1a2332] rounded p-2">
          <div className="text-gray-500">方案数</div>
          <div className="text-lg font-bold text-white">{totalStats.plans}</div>
        </div>
        <div className="bg-[#1a2332] rounded p-2">
          <div className="text-gray-500">拥堵热区</div>
          <div className="text-lg font-bold text-orange-400">{totalStats.hotspots}</div>
        </div>
        <div className="bg-[#1a2332] rounded p-2">
          <div className="text-gray-500">平均严重度</div>
          <div className="text-lg font-bold text-amber-400">{totalStats.avgSeverity}%</div>
        </div>
        <div className="bg-[#1a2332] rounded p-2">
          <div className="text-gray-500">活跃方案</div>
          <div className="text-sm font-bold text-cyan-400 truncate">
            {totalStats.activePlan?.name || '无'}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => setShowFilter(!showFilter)}
          className={`flex items-center gap-1 px-2 py-1.5 rounded text-[11px] border transition-all ${
            showFilter
              ? 'bg-orange-500/20 border-orange-500/50 text-orange-300'
              : 'bg-[#1a2332] border-[#2a3a4e] text-gray-400 hover:border-orange-500/30'
          }`}
        >
          <Filter size={12} />
          筛选
        </button>

        <button
          onClick={detectCongestionHotspots}
          className="flex items-center gap-1 px-2 py-1.5 rounded text-[11px] bg-[#1a2332] border border-[#2a3a4e] text-gray-400 hover:border-orange-500/30"
        >
          <RefreshCw size={12} />
          检测拥堵
        </button>

        <div className="relative">
          <button
            onClick={() => setShowPlanCount(!showPlanCount)}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-[11px] bg-[#1a2332] border border-[#2a3a4e] text-gray-400 hover:border-cyan-500/30"
          >
            <Zap size={12} />
            生成 {planCount} 组
          </button>
          {showPlanCount && (
            <div className="absolute top-full left-0 mt-1 z-10 bg-[#1a2332] border border-[#2a3a4e] rounded p-2 w-36 shadow-xl">
              <div className="text-[10px] text-gray-400 mb-2">生成方案数量</div>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={planCount}
                onChange={(e) => setPlanCount(parseInt(e.target.value))}
                className="w-full accent-cyan-500"
              />
              <div className="flex justify-between mt-1 text-[9px] text-gray-500">
                <span>1组</span>
                <span className="text-cyan-400 font-bold">{planCount}组</span>
                <span>5组</span>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={handleGeneratePlans}
          disabled={hotspots.length === 0}
          className="flex items-center gap-1 px-2 py-1.5 rounded text-[11px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={12} />
          生成方案
        </button>
      </div>

      {showFilter && (
        <div className="bg-[#1a2332] border border-[#2a3a4e] rounded p-3 space-y-2">
          <div className="text-[10px] font-semibold text-orange-300">拥堵筛选条件</div>
          
          <div className="space-y-1">
            <div className="text-[9px] text-gray-500">班次</div>
            <div className="flex gap-1 flex-wrap">
              {shiftOptions.map((shift) => (
                <button
                  key={shift}
                  onClick={() => setCongestionFilter({ shift })}
                  className={`px-2 py-1 rounded text-[10px] border ${
                    congestion.filter.shift === shift
                      ? 'bg-orange-500/20 border-orange-500/40 text-orange-300'
                      : 'bg-[#0f1419] border-[#2a3a4e] text-gray-400 hover:border-orange-500/30'
                  }`}
                >
                  {shiftLabel[shift]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-[9px] text-gray-500">最低严重度</span>
              <span className="text-[9px] text-orange-400 font-mono">{congestion.filter.minCongestionLevel}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={90}
              step={5}
              value={congestion.filter.minCongestionLevel}
              onChange={(e) => setCongestionFilter({ minCongestionLevel: parseInt(e.target.value) })}
              className="w-full accent-orange-500"
            />
          </div>

          <div className="space-y-1">
            <div className="text-[9px] text-gray-500">区域筛选</div>
            <div className="flex gap-1 flex-wrap">
              {[...new Set(locations.map((l) => l.zone))].sort().map((zone) => {
                const selected = congestion.filter.zones.includes(zone);
                return (
                  <button
                    key={zone}
                    onClick={() => {
                      const newZones = selected
                        ? congestion.filter.zones.filter((z) => z !== zone)
                        : [...congestion.filter.zones, zone];
                      setCongestionFilter({ zones: newZones });
                    }}
                    className={`px-2 py-1 rounded text-[10px] border ${
                      selected
                        ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                        : 'bg-[#0f1419] border-[#2a3a4e] text-gray-400 hover:border-cyan-500/30'
                    }`}
                  >
                    {zone}
                  </button>
                );
              })}
              {congestion.filter.zones.length > 0 && (
                <button
                  onClick={() => setCongestionFilter({ zones: [] })}
                  className="px-2 py-1 rounded text-[10px] text-gray-500 hover:text-red-400"
                >
                  清除
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        <button
          onClick={handleImportClick}
          className="flex items-center gap-1 px-2 py-1.5 rounded text-[11px] bg-[#1a2332] border border-[#2a3a4e] text-gray-400 hover:border-green-500/30"
        >
          <Upload size={12} />
          导入
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleFileChange}
          className="hidden"
        />

        <button
          onClick={() => exportCongestionPlans()}
          disabled={congestion.plans.length === 0}
          className="flex items-center gap-1 px-2 py-1.5 rounded text-[11px] bg-[#1a2332] border border-[#2a3a4e] text-gray-400 hover:border-blue-500/30 disabled:opacity-40"
        >
          <Download size={12} />
          导出
        </button>

        <button
          onClick={() => undoLastCongestionAction()}
          disabled={undoSize === 0}
          className="flex items-center gap-1 px-2 py-1.5 rounded text-[11px] bg-[#1a2332] border border-[#2a3a4e] text-gray-400 hover:border-amber-500/30 disabled:opacity-40"
          title={`可撤销 ${undoSize} 步`}
        >
          <Undo2 size={12} />
          {undoSize > 0 ? `撤销(${undoSize})` : '撤销'}
        </button>

        <button
          onClick={saveCongestionDraft}
          className="flex items-center gap-1 px-2 py-1.5 rounded text-[11px] bg-[#1a2332] border border-[#2a3a4e] text-gray-400 hover:border-cyan-500/30"
          title="保存草稿到本地"
        >
          <Save size={12} />
        </button>

        <button
          onClick={loadCongestionDraft}
          className="flex items-center gap-1 px-2 py-1.5 rounded text-[11px] bg-[#1a2332] border border-[#2a3a4e] text-gray-400 hover:border-green-500/30"
          title="从本地加载草稿"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      <div className="flex items-center gap-2 text-[10px]">
        <label className="flex items-center gap-1 cursor-pointer text-gray-500">
          <input
            type="checkbox"
            checked={congestion.autoSaveEnabled}
            onChange={(e) => setCongestionAutoSaveEnabled(e.target.checked)}
            className="accent-orange-500"
          />
          自动保存草稿
        </label>
        {congestion.lastAutoSavedAt && (
          <span className="text-gray-600 flex items-center gap-1">
            <Clock size={10} />
            {new Date(congestion.lastAutoSavedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="flex gap-1">
        <button
          onClick={() => setShowConflicts(!showConflicts)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] border transition-colors flex-1 ${
            showConflicts
              ? 'bg-amber-500/20 border-amber-500/30 text-amber-300'
              : 'bg-[#1a2332] border-[#2a3a4e] text-gray-500 hover:text-amber-400'
          }`}
        >
          <AlertTriangle size={11} />
          冲突 ({congestion.conflicts.length})
        </button>
        <button
          onClick={() => setShowLogs(!showLogs)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] border transition-colors flex-1 ${
            showLogs
              ? 'bg-cyan-500/20 border-cyan-500/30 text-cyan-300'
              : 'bg-[#1a2332] border-[#2a3a4e] text-gray-500 hover:text-cyan-400'
          }`}
        >
          <Info size={11} />
          日志 ({congestion.actionLogs.length})
        </button>
      </div>

      {showConflicts && congestion.conflicts.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded p-2 max-h-40 overflow-y-auto space-y-1.5">
          <div className="flex justify-between items-center mb-1">
            <div className="text-[10px] font-semibold text-amber-300">冲突提示</div>
            <button
              onClick={clearCongestionConflicts}
              className="text-[9px] text-gray-500 hover:text-red-400"
            >
              清空
            </button>
          </div>
          {congestion.conflicts.map((c, i) => {
            const Icon = conflictTypeIcon[c.type];
            return (
              <div key={i} className="text-[10px] flex gap-1.5 items-start bg-[#1a2332]/50 rounded p-1.5">
                <Icon size={11} className={`shrink-0 mt-0.5 ${
                  c.resolved ? 'text-green-400' : 'text-amber-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="text-gray-300 break-words">{c.message}</div>
                  <div className="flex gap-2 mt-0.5 text-[9px] flex-wrap">
                    <span className={`${
                      c.resolved ? 'text-green-400' : 'text-amber-400'
                    }`}>
                      {c.resolved ? `已解决: ${
                        c.resolution === 'skip' ? '跳过' :
                        c.resolution === 'rename' ? '重命名' :
                        c.resolution === 'overwrite' ? '覆盖' :
                        c.resolution === 'fix' ? '修复' : '合并'
                      }` : '待处理'}
                    </span>
                    {c.planNo && (
                      <span className="text-gray-500">方案: {c.planNo}</span>
                    )}
                    {c.locationId && (
                      <span className="text-gray-500">货位: {c.locationId}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showLogs && congestion.actionLogs.length > 0 && (
        <div className="bg-cyan-500/5 border border-cyan-500/20 rounded p-2 max-h-40 overflow-y-auto space-y-1">
          <div className="flex justify-between items-center mb-1">
            <div className="text-[10px] font-semibold text-cyan-300">操作日志</div>
            <button
              onClick={clearCongestionLogs}
              className="text-[9px] text-gray-500 hover:text-red-400"
            >
              清空
            </button>
          </div>
          {congestion.actionLogs.slice(0, 20).map((log) => (
            <div key={log.id} className="text-[10px] flex gap-1.5">
              <Clock size={10} className="text-gray-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-gray-400">
                  {new Date(log.timestamp).toLocaleTimeString()}
                  <span className="mx-1 text-gray-600">|</span>
                  <span className="text-cyan-400">{log.action}</span>
                </div>
                <div className="text-gray-300 break-words">{log.description}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {congestion.showComparison && congestion.comparePlanId && (
        <div className="bg-purple-500/10 border border-purple-500/30 rounded p-2">
          <div className="flex items-center justify-between">
            <div className="text-[10px] text-purple-300 flex items-center gap-1">
              <SplitSquareVertical size={11} />
              对比模式已开启
            </div>
            <button
              onClick={toggleCongestionComparison}
              className="text-[9px] text-gray-400 hover:text-white"
            >
              关闭对比
            </button>
          </div>
          <div className="text-[9px] text-gray-400 mt-1">
            对比方案: {congestion.plans.find((p) => p.id === congestion.comparePlanId)?.name}
          </div>
        </div>
      )}

      {orderedPlans.length > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <div className="text-[10px] text-gray-500">按优先级排列</div>
            <button
              onClick={() => {
                if (confirm('确认清空全部拥堵方案？此操作可撤销。')) {
                  clearCongestionPlans();
                }
              }}
              className="flex items-center gap-1 text-[9px] text-red-400/70 hover:text-red-400"
            >
              <Trash2 size={10} />
              全部清空
            </button>
          </div>

          {orderedPlans.map((plan, index) => {
            const isExpanded = expandedPlanId === plan.id;
            const isEditing = editingPlanId === plan.id;
            const isActive = congestion.activePlanId === plan.id;
            const isCompare = congestion.comparePlanId === plan.id;

            return (
              <div
                key={plan.id}
                className={`rounded border overflow-hidden transition-all ${
                  isActive
                    ? 'border-cyan-500/50 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                    : isCompare
                    ? 'border-purple-500/50'
                    : 'border-[#2a3a4e] hover:border-orange-500/30'
                } ${plan.status === 'archived' ? 'opacity-60' : ''}`}
              >
                <div
                  onClick={() => {
                    setActiveCongestionPlan(isActive ? null : plan.id);
                    setExpandedPlanId(isActive && isExpanded ? null : plan.id);
                  }}
                  className="bg-[#1a2332] px-2 py-1.5 flex items-center gap-1.5 cursor-pointer"
                >
                  <GripVertical size={12} className="text-gray-600 shrink-0" />
                  <div className="flex flex-col shrink-0 w-14">
                    <span className="text-[10px] text-gray-500">排序 #{index + 1}</span>
                    <span className="text-[9px] font-mono text-orange-400">{plan.planNo}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div onClick={(e) => e.stopPropagation()} className="space-y-1">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full text-[11px] bg-[#0f1419] border border-cyan-500/30 rounded px-1.5 py-0.5 text-white"
                        />
                        <div className="flex gap-1">
                          <select
                            value={editPriority}
                            onChange={(e) => setEditPriority(e.target.value as PlanPriority)}
                            className="flex-1 text-[10px] bg-[#0f1419] border border-[#2a3a4e] rounded px-1 py-0.5 text-gray-300"
                          >
                            {priorityOptions.map((p) => (
                              <option key={p} value={p}>{priorityLabel[p]}优先级</option>
                            ))}
                          </select>
                          <button
                            onClick={() => saveEdit(plan.id)}
                            className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] hover:bg-cyan-500/30"
                          >
                            <CheckCircle2 size={11} />
                          </button>
                          <button
                            onClick={() => setEditingPlanId(null)}
                            className="px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400 text-[10px]"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="text-[11px] font-medium text-white truncate">
                          {plan.name}
                        </div>
                        <div className="flex gap-1 items-center text-[9px] flex-wrap">
                          <span className={`px-1.5 py-0.5 rounded border ${priorityColor[plan.priority]}`}>
                            {priorityLabel[plan.priority]}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded ${statusColor[plan.status]}`}>
                            {statusLabel[plan.status]}
                          </span>
                          <span className="text-gray-500">
                            {plan.hotspots.length}热区
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    {isActive && (
                      <span className="text-[8px] px-1 py-0.5 rounded bg-cyan-500/30 text-cyan-300">
                        活动
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronUp size={12} className="text-gray-500" />
                    ) : (
                      <ChevronDown size={12} className="text-gray-500" />
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="bg-[#0f1419] p-2 space-y-2 border-t border-[#2a3a4e]">
                    {!isEditing && (
                      <div className="flex gap-1 flex-wrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startEdit(plan);
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[9px] bg-[#1a2332] border border-[#2a3a4e] text-gray-400 hover:border-cyan-500/30"
                        >
                          <Edit3 size={10} />
                          编辑
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCompareCongestionPlan(isCompare ? null : plan.id);
                            if (!isCompare && !congestion.showComparison) {
                              toggleCongestionComparison();
                            }
                          }}
                          className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] border ${
                            isCompare
                              ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                              : 'bg-[#1a2332] border-[#2a3a4e] text-gray-400 hover:border-purple-500/30'
                          }`}
                        >
                          <SplitSquareVertical size={10} />
                          {isCompare ? '取消对比' : '对比'}
                        </button>
                        <select
                          value={plan.priority}
                          onChange={(e) => {
                            e.stopPropagation();
                            adjustCongestionPlanPriority(plan.id, e.target.value as PlanPriority);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="px-2 py-1 rounded text-[9px] bg-[#1a2332] border border-[#2a3a4e] text-gray-300"
                        >
                          {priorityOptions.map((p) => (
                            <option key={p} value={p}>{priorityLabel[p]}</option>
                          ))}
                        </select>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`确认删除方案 "${plan.name}"？此操作可撤销。`)) {
                              deleteCongestionPlan(plan.id);
                              setExpandedPlanId(null);
                            }
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[9px] bg-[#1a2332] border border-[#2a3a4e] text-gray-400 hover:border-red-500/30"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-1 text-[9px]">
                      <div className="bg-[#1a2332] rounded p-1.5">
                        <div className="text-gray-500">总等待时间</div>
                        <div className="flex items-center gap-1">
                          <span className="text-red-400 line-through">{plan.metrics.totalWaitTimeBefore.toFixed(1)}m</span>
                          <span className="text-green-400">→ {plan.metrics.totalWaitTimeAfter.toFixed(1)}m</span>
                        </div>
                      </div>
                      <div className="bg-[#1a2332] rounded p-1.5">
                        <div className="text-gray-500">吞吐提升</div>
                        <div className="text-green-400 font-bold">+{plan.metrics.estimatedThroughputGain.toFixed(1)}%</div>
                      </div>
                      <div className="bg-[#1a2332] rounded p-1.5">
                        <div className="text-gray-500">热区数量</div>
                        <div className="flex items-center gap-1">
                          <span className="text-red-400">{plan.metrics.totalHotspotsBefore}</span>
                          <span className="text-gray-500">→</span>
                          <span className="text-green-400">{plan.metrics.totalHotspotsAfter}</span>
                        </div>
                      </div>
                      <div className="bg-[#1a2332] rounded p-1.5">
                        <div className="text-gray-500">路线距离</div>
                        <div className="text-cyan-400">{plan.metrics.routeDistance.toFixed(1)}m</div>
                      </div>
                    </div>

                    <div className="text-[9px] space-y-0.5">
                      <div className="text-gray-500 flex justify-between">
                        <span>来源</span>
                        <span className="text-gray-300">{sourceLabel[plan.source]}</span>
                      </div>
                      <div className="text-gray-500 flex justify-between">
                        <span>创建时间</span>
                        <span className="text-gray-300">{new Date(plan.createdAt).toLocaleString()}</span>
                      </div>
                      {plan.notes && (
                        <div className="text-gray-500">
                          <div>备注</div>
                          <div className="text-gray-300 bg-[#1a2332] rounded p-1.5 mt-0.5">{plan.notes}</div>
                        </div>
                      )}
                    </div>

                    {plan.affectedLocations.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[9px] text-gray-500 flex justify-between items-center">
                          <span>受影响货位 ({plan.affectedLocations.length})</span>
                          <span className="text-green-400">
                            改进 {plan.metrics.improvedLocationsCount} 个
                          </span>
                        </div>
                        <div className="max-h-32 overflow-y-auto space-y-0.5">
                          {plan.affectedLocations.slice(0, 10).map((loc) => (
                            <div
                              key={loc.locationId}
                              className="flex items-center gap-1.5 text-[9px] bg-[#1a2332] rounded px-1.5 py-1"
                            >
                              <button
                                onClick={() => handleLockToggle(plan.id, loc.locationId, loc.locked)}
                                className="shrink-0"
                              >
                                {loc.locked ? (
                                  <Lock size={10} className="text-amber-400" />
                                ) : (
                                  <Unlock size={10} className="text-gray-600 hover:text-amber-400" />
                                )}
                              </button>
                              <span className="text-gray-300 font-mono flex-1 truncate">{loc.locationId}</span>
                              <span className="text-gray-500">
                                {loc.beforeWaitTime.toFixed(1)}→{loc.afterWaitTime.toFixed(1)}m
                              </span>
                              <span className={loc.improvement > 0 ? 'text-green-400' : 'text-red-400'}>
                                {loc.improvement > 0 ? '+' : ''}{loc.improvement.toFixed(0)}%
                              </span>
                            </div>
                          ))}
                          {plan.affectedLocations.length > 10 && (
                            <div className="text-[9px] text-gray-500 text-center py-1">
                              还有 {plan.affectedLocations.length - 10} 个货位...
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {orderedPlans.length === 0 && hotspots.length > 0 && (
        <div className="text-center py-4 text-[10px] text-gray-500">
          <div className="mb-1">检测到 {hotspots.length} 个拥堵热区</div>
          <div>点击"生成方案"创建疏导方案</div>
        </div>
      )}

      {orderedPlans.length === 0 && hotspots.length === 0 && (
        <div className="text-center py-4 text-[10px] text-gray-500">
          <div className="mb-1">暂无拥堵方案</div>
          <div>先检测拥堵或导入方案</div>
        </div>
      )}
    </div>
  );
}
