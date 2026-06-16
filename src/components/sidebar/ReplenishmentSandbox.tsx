import { useState, useRef } from 'react';
import {
  Package,
  Plus,
  Upload,
  Download,
  Undo2,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  Clock,
  TrendingUp,
  Target,
  Layers,
  ChevronDown,
  ChevronUp,
  Edit3,
  Save,
  RotateCcw,
  Filter,
  X,
  ArrowUp,
  ArrowDown,
  GripVertical,
} from 'lucide-react';
import { useWarehouseStore } from '@/store/warehouseStore';
import type { ReplenishmentBatch, BatchPriority, ReplenishmentConflict } from '@/types/warehouse';

const priorityColor: Record<BatchPriority, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

const priorityLabel: Record<BatchPriority, string> = {
  critical: '紧急',
  high: '高',
  medium: '中',
  low: '低',
};

const statusLabel: Record<ReplenishmentBatch['status'], string> = {
  draft: '草稿',
  pending: '待处理',
  processing: '处理中',
  completed: '已完成',
};

const statusColor: Record<ReplenishmentBatch['status'], string> = {
  draft: 'bg-gray-500/20 text-gray-400',
  pending: 'bg-amber-500/20 text-amber-400',
  processing: 'bg-blue-500/20 text-blue-400',
  completed: 'bg-green-500/20 text-green-400',
};

const conflictTypeIcon: Record<ReplenishmentConflict['type'], typeof AlertTriangle> = {
  duplicate_batch_no: Layers,
  location_occupied: Target,
  missing_required_field: Info,
  unknown_location: XCircle,
  version_mismatch: AlertTriangle,
};

export default function ReplenishmentSandbox() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [showHeatSlider, setShowHeatSlider] = useState(false);
  const [heatThreshold, setHeatThreshold] = useState(50);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPriority, setEditPriority] = useState<BatchPriority>('medium');
  const [showLogs, setShowLogs] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);

  const replenishment = useWarehouseStore((s) => s.replenishment);
  const locations = useWarehouseStore((s) => s.locations);
  const setSelectionMode = useWarehouseStore((s) => s.setSelectionMode);
  const toggleLocationSelection = useWarehouseStore((s) => s.toggleLocationSelection);
  const clearLocationSelection = useWarehouseStore((s) => s.clearLocationSelection);
  const selectLocationsByHeat = useWarehouseStore((s) => s.selectLocationsByHeat);
  const createBatchFromSelection = useWarehouseStore((s) => s.createBatchFromSelection);
  const updateBatch = useWarehouseStore((s) => s.updateBatch);
  const deleteBatch = useWarehouseStore((s) => s.deleteBatch);
  const removeLocationFromBatch = useWarehouseStore((s) => s.removeLocationFromBatch);
  const adjustBatchOrder = useWarehouseStore((s) => s.adjustBatchOrder);
  const setActiveBatch = useWarehouseStore((s) => s.setActiveBatch);
  const exportReplenishmentBatches = useWarehouseStore((s) => s.exportReplenishmentBatches);
  const importReplenishmentBatches = useWarehouseStore((s) => s.importReplenishmentBatches);
  const undoLastReplenishmentAction = useWarehouseStore((s) => s.undoLastReplenishmentAction);
  const getReplenishmentUndoStackSize = useWarehouseStore((s) => s.getReplenishmentUndoStackSize);
  const clearReplenishmentConflicts = useWarehouseStore((s) => s.clearReplenishmentConflicts);
  const clearReplenishmentBatches = useWarehouseStore((s) => s.clearReplenishmentBatches);
  const saveReplenishmentDraft = useWarehouseStore((s) => s.saveReplenishmentDraft);
  const getBatchesInProcessingOrder = useWarehouseStore((s) => s.getBatchesInProcessingOrder);
  const getLocationOccupancyMap = useWarehouseStore((s) => s.getLocationOccupancyMap);
  const setAutoSaveEnabled = useWarehouseStore((s) => s.setAutoSaveEnabled);
  const clearReplenishmentLogs = useWarehouseStore((s) => s.clearReplenishmentLogs);

  const orderedBatches = getBatchesInProcessingOrder();
  const occupancyMap = getLocationOccupancyMap();
  const undoSize = getReplenishmentUndoStackSize();

  const totalStats = {
    batches: replenishment.batches.length,
    locations: replenishment.batches.reduce((s, b) => s + b.locations.length, 0),
    shortage: replenishment.batches.reduce((s, b) => s + b.totalShortage, 0),
    selected: replenishment.selectedLocationIds.length,
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
        importReplenishmentBatches(data);
      } catch {
        importReplenishmentBatches(null);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function handleCreateBatch() {
    const batch = createBatchFromSelection();
    if (batch) {
      setExpandedBatchId(batch.id);
    }
  }

  function startEdit(batch: ReplenishmentBatch) {
    setEditingBatchId(batch.id);
    setEditName(batch.name);
    setEditPriority(batch.priority);
  }

  function saveEdit(batchId: string) {
    updateBatch(batchId, { name: editName, priority: editPriority });
    setEditingBatchId(null);
  }

  const priorityOptions: BatchPriority[] = ['critical', 'high', 'medium', 'low'];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Package size={16} className="text-cyan-400" />
        <h3 className="text-sm font-semibold text-cyan-300">补货任务沙盘</h3>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div className="bg-[#1a2332] rounded p-2">
          <div className="text-gray-500">批次</div>
          <div className="text-lg font-bold text-white">{totalStats.batches}</div>
        </div>
        <div className="bg-[#1a2332] rounded p-2">
          <div className="text-gray-500">货位</div>
          <div className="text-lg font-bold text-white">{totalStats.locations}</div>
        </div>
        <div className="bg-[#1a2332] rounded p-2">
          <div className="text-gray-500">总缺口</div>
          <div className="text-lg font-bold text-orange-400">{totalStats.shortage}</div>
        </div>
        <div className="bg-[#1a2332] rounded p-2">
          <div className="text-gray-500">已选中</div>
          <div className="text-lg font-bold text-cyan-400">{totalStats.selected}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => setSelectionMode(!replenishment.selectionMode)}
          className={`flex items-center gap-1 px-2 py-1.5 rounded text-[11px] border transition-all ${
            replenishment.selectionMode
              ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
              : 'bg-[#1a2332] border-[#2a3a4e] text-gray-400 hover:border-cyan-500/30'
          }`}
        >
          <Target size={12} />
          {replenishment.selectionMode ? '退出圈选' : '圈选模式'}
        </button>

        <div className="relative">
          <button
            onClick={() => setShowHeatSlider(!showHeatSlider)}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-[11px] bg-[#1a2332] border border-[#2a3a4e] text-gray-400 hover:border-orange-500/30"
          >
            <TrendingUp size={12} />
            阈值 {heatThreshold}%
          </button>
          {showHeatSlider && (
            <div className="absolute top-full left-0 mt-1 z-10 bg-[#1a2332] border border-[#2a3a4e] rounded p-3 w-48 shadow-xl">
              <div className="text-[10px] text-gray-400 mb-2">按热度百分比圈选</div>
              <input
                type="range"
                min={10}
                max={90}
                step={5}
                value={heatThreshold}
                onChange={(e) => setHeatThreshold(parseInt(e.target.value))}
                className="w-full accent-orange-500"
              />
              <div className="flex justify-between mt-1 text-[9px] text-gray-500">
                <span>10%</span>
                <span className="text-orange-400 font-bold">{heatThreshold}%</span>
                <span>90%</span>
              </div>
              <button
                onClick={() => {
                  selectLocationsByHeat(heatThreshold);
                  setShowHeatSlider(false);
                }}
                className="mt-2 w-full px-2 py-1 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[10px] hover:bg-orange-500/30"
              >
                圈选 ≥ {heatThreshold}% 热度
              </button>
            </div>
          )}
        </div>

        {replenishment.selectedLocationIds.length > 0 && (
          <button
            onClick={clearLocationSelection}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-[11px] bg-[#1a2332] border border-[#2a3a4e] text-gray-400 hover:border-red-500/30"
            title="清空选择"
          >
            <X size={12} />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        <button
          onClick={handleCreateBatch}
          disabled={replenishment.selectedLocationIds.length === 0}
          className="flex items-center gap-1 px-2 py-1.5 rounded text-[11px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={12} />
          从选中创建批次
        </button>

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
          onClick={exportReplenishmentBatches}
          disabled={replenishment.batches.length === 0}
          className="flex items-center gap-1 px-2 py-1.5 rounded text-[11px] bg-[#1a2332] border border-[#2a3a4e] text-gray-400 hover:border-blue-500/30 disabled:opacity-40"
        >
          <Download size={12} />
          导出
        </button>

        <button
          onClick={() => undoLastReplenishmentAction()}
          disabled={undoSize === 0}
          className="flex items-center gap-1 px-2 py-1.5 rounded text-[11px] bg-[#1a2332] border border-[#2a3a4e] text-gray-400 hover:border-amber-500/30 disabled:opacity-40"
          title={`可撤销 ${undoSize} 步`}
        >
          <Undo2 size={12} />
          {undoSize > 0 ? `撤销(${undoSize})` : '撤销'}
        </button>

        <button
          onClick={saveReplenishmentDraft}
          className="flex items-center gap-1 px-2 py-1.5 rounded text-[11px] bg-[#1a2332] border border-[#2a3a4e] text-gray-400 hover:border-cyan-500/30"
          title="保存草稿到本地"
        >
          <Save size={12} />
        </button>
      </div>

      <div className="flex items-center gap-2 text-[10px]">
        <label className="flex items-center gap-1 cursor-pointer text-gray-500">
          <input
            type="checkbox"
            checked={replenishment.autoSaveEnabled}
            onChange={(e) => setAutoSaveEnabled(e.target.checked)}
            className="accent-cyan-500"
          />
          自动保存草稿
        </label>
        {replenishment.lastAutoSavedAt && (
          <span className="text-gray-600 flex items-center gap-1">
            <Clock size={10} />
            {new Date(replenishment.lastAutoSavedAt).toLocaleTimeString()}
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
          冲突 ({replenishment.conflicts.length})
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
          日志 ({replenishment.actionLogs.length})
        </button>
      </div>

      {showConflicts && replenishment.conflicts.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded p-2 max-h-40 overflow-y-auto space-y-1.5">
          <div className="flex justify-between items-center mb-1">
            <div className="text-[10px] font-semibold text-amber-300">冲突提示</div>
            <button
              onClick={clearReplenishmentConflicts}
              className="text-[9px] text-gray-500 hover:text-red-400"
            >
              清空
            </button>
          </div>
          {replenishment.conflicts.map((c, i) => {
            const Icon = conflictTypeIcon[c.type];
            return (
              <div key={i} className="text-[10px] flex gap-1.5 items-start bg-[#1a2332]/50 rounded p-1.5">
                <Icon size={11} className={`shrink-0 mt-0.5 ${
                  c.resolved ? 'text-green-400' : 'text-amber-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="text-gray-300 break-words">{c.message}</div>
                  <div className="flex gap-2 mt-0.5 text-[9px]">
                    <span className={`${
                      c.resolved ? 'text-green-400' : 'text-amber-400'
                    }`}>
                      {c.resolved ? `已解决: ${
                        c.resolution === 'skip' ? '跳过' :
                        c.resolution === 'rename' ? '重命名' :
                        c.resolution === 'overwrite' ? '覆盖' : '合并'
                      }` : '待处理'}
                    </span>
                    {c.batchNo && (
                      <span className="text-gray-500">批次: {c.batchNo}</span>
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

      {showLogs && replenishment.actionLogs.length > 0 && (
        <div className="bg-cyan-500/5 border border-cyan-500/20 rounded p-2 max-h-40 overflow-y-auto space-y-1">
          <div className="flex justify-between items-center mb-1">
            <div className="text-[10px] font-semibold text-cyan-300">操作日志</div>
            <button
              onClick={clearReplenishmentLogs}
              className="text-[9px] text-gray-500 hover:text-red-400"
            >
              清空
            </button>
          </div>
          {replenishment.actionLogs.slice(0, 20).map((log) => (
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

      {orderedBatches.length > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <div className="text-[10px] text-gray-500">按处理顺序排列</div>
            <button
              onClick={() => {
                if (confirm('确认清空全部补货批次？此操作可撤销。')) {
                  clearReplenishmentBatches();
                }
              }}
              className="flex items-center gap-1 text-[9px] text-red-400/70 hover:text-red-400"
            >
              <Trash2 size={10} />
              全部清空
            </button>
          </div>

          {orderedBatches.map((batch) => {
            const isExpanded = expandedBatchId === batch.id;
            const isEditing = editingBatchId === batch.id;
            const isActive = replenishment.activeBatchId === batch.id;
            const occupancyMapLocal = getLocationOccupancyMap();

            return (
              <div
                key={batch.id}
                onClick={() => setActiveBatch(isActive ? null : batch.id)}
                className={`rounded border overflow-hidden cursor-pointer transition-all ${
                  isActive
                    ? 'border-cyan-500/50 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                    : 'border-[#2a3a4e] hover:border-cyan-500/30'
                } ${batch.status === 'completed' ? 'opacity-60' : ''}`}
              >
                <div className="bg-[#1a2332] px-2 py-1.5 flex items-center gap-1.5">
                  <GripVertical size={12} className="text-gray-600 shrink-0" />
                  <div className="flex flex-col shrink-0 w-14">
                    <span className="text-[10px] text-gray-500">顺序 #{batch.estimatedOrder}</span>
                    <span className="text-[9px] font-mono text-cyan-400">{batch.batchNo}</span>
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
                            onChange={(e) => setEditPriority(e.target.value as BatchPriority)}
                            className="flex-1 text-[10px] bg-[#0f1419] border border-[#2a3a4e] rounded px-1 py-0.5 text-gray-300"
                          >
                            {priorityOptions.map((p) => (
                              <option key={p} value={p}>{priorityLabel[p]}优先级</option>
                            ))}
                          </select>
                          <button
                            onClick={() => saveEdit(batch.id)}
                            className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] hover:bg-cyan-500/30"
                          >
                            <CheckCircle2 size={11} />
                          </button>
                          <button
                            onClick={() => setEditingBatchId(null)}
                            className="px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400 text-[10px]"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="text-[11px] font-medium text-white truncate">
                          {batch.name}
                        </div>
                        <div className="flex gap-1 items-center text-[9px]">
                          <span className={`px-1.5 py-0.5 rounded border ${priorityColor[batch.priority]}`}>
                            {priorityLabel[batch.priority]}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded ${statusColor[batch.status]}`}>
                            {statusLabel[batch.status]}
                          </span>
                          <span className="text-gray-500">
                            {batch.locations.length}货位 · 缺口{batch.totalShortage}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => adjustBatchOrder(batch.id, batch.estimatedOrder - 1)}
                        disabled={batch.estimatedOrder <= 1}
                        className="p-1 rounded hover:bg-white/5 text-gray-500 hover:text-white disabled:opacity-30"
                        title="提前处理"
                      >
                        <ArrowUp size={11} />
                      </button>
                      <button
                        onClick={() => adjustBatchOrder(batch.id, batch.estimatedOrder + 1)}
                        disabled={batch.estimatedOrder >= orderedBatches.length}
                        className="p-1 rounded hover:bg-white/5 text-gray-500 hover:text-white disabled:opacity-30"
                        title="延后处理"
                      >
                        <ArrowDown size={11} />
                      </button>
                      <button
                        onClick={() => startEdit(batch)}
                        className="p-1 rounded hover:bg-white/5 text-gray-500 hover:text-cyan-400"
                        title="编辑"
                      >
                        <Edit3 size={11} />
                      </button>
                      <button
                        onClick={() => setExpandedBatchId(isExpanded ? null : batch.id)}
                        className="p-1 rounded hover:bg-white/5 text-gray-500"
                      >
                        {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`确认删除批次 ${batch.batchNo}？此操作可撤销。`)) {
                            deleteBatch(batch.id);
                          }
                        }}
                        className="p-1 rounded hover:bg-red-500/10 text-gray-500 hover:text-red-400"
                        title="删除"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )}
                </div>

                {isExpanded && (
                  <div className="bg-[#0f1419] p-2 border-t border-[#2a3a4e] space-y-2">
                    <div className="grid grid-cols-3 gap-1 text-[9px]">
                      <div className="bg-[#1a2332] rounded p-1.5 text-center">
                        <div className="text-gray-500">货位数</div>
                        <div className="text-white font-bold">{batch.locations.length}</div>
                      </div>
                      <div className="bg-[#1a2332] rounded p-1.5 text-center">
                        <div className="text-gray-500">总缺口</div>
                        <div className="text-orange-400 font-bold">{batch.totalShortage}</div>
                      </div>
                      <div className="bg-[#1a2332] rounded p-1.5 text-center">
                        <div className="text-gray-500">平均热度</div>
                        <div className="text-cyan-400 font-bold">
                          {batch.locations.length > 0
                            ? Math.round(batch.locations.reduce((s, l) => s + l.heatLevel, 0) / batch.locations.length)
                            : 0}%
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      <div className="text-[9px] text-gray-500 flex justify-between px-1">
                        <span>货位ID</span>
                        <span>当前/目标/缺口</span>
                      </div>
                      {batch.locations.map((bl) => {
                        const loc = locations.find((l) => l.id === bl.locationId);
                        const heatColor =
                          bl.heatLevel >= 75 ? 'bg-red-500' :
                          bl.heatLevel >= 50 ? 'bg-orange-500' :
                          bl.heatLevel >= 25 ? 'bg-yellow-500' : 'bg-blue-500';
                        return (
                          <div
                            key={bl.locationId}
                            className="flex items-center gap-1.5 bg-[#1a2332] rounded px-1.5 py-1 text-[10px]"
                          >
                            <div className={`w-1.5 h-6 rounded shrink-0 ${heatColor}`} title={`热度 ${bl.heatLevel}%`} />
                            <div className="flex-1 min-w-0">
                              <div className="text-white font-mono truncate">{bl.locationId}</div>
                              {loc && (
                                <div className="text-[9px] text-gray-500">
                                  {loc.zone}区 R{loc.row}C{loc.col}L{loc.layer}
                                </div>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-gray-400">
                                <span className="text-yellow-400">{bl.currentStock}</span>
                                <span className="text-gray-600"> / </span>
                                <span className="text-green-400">{bl.targetStock}</span>
                              </div>
                              <div className="text-orange-400 font-bold">-{bl.shortage}</div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`从批次移除货位 ${bl.locationId}？`)) {
                                  removeLocationFromBatch(batch.id, bl.locationId);
                                }
                              }}
                              className="p-0.5 rounded hover:bg-red-500/10 text-gray-500 hover:text-red-400 shrink-0"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {orderedBatches.length === 0 && replenishment.conflicts.length === 0 && (
        <div className="text-center py-4 text-[11px] text-gray-600 space-y-1">
          <Filter size={24} className="mx-auto opacity-40" />
          <div>暂无补货批次</div>
          <div className="text-[10px]">
            在3D视图或侧边栏中 <span className="text-cyan-400">圈选高热货位</span>，<br />
            然后点击「从选中创建批次」
          </div>
        </div>
      )}

      {locations.length === 0 && (
        <div className="text-[10px] text-amber-400/70 bg-amber-500/5 border border-amber-500/20 rounded p-2 flex gap-1.5 items-start">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <span>请先导入仓储布局和拣货数据，或装载演示预设，然后才能使用补货沙盘</span>
        </div>
      )}
    </div>
  );
}
