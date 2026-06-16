import { useRef, useState } from 'react';
import {
  Archive,
  Download,
  Upload,
  Trash2,
  RotateCcw,
  Play,
  Save,
  FileJson,
  X,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Info,
  Clock,
  Tag,
  Layers,
  MapPin,
  Calendar,
  ChevronDown,
  ChevronRight,
  Undo2,
} from 'lucide-react';
import { useWarehouseStore } from '@/store/warehouseStore';
import type { SnapshotArchiveEntry, SnapshotSource } from '@/types/warehouse';

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  } catch {
    return iso;
  }
}

function getSourceBadge(source: SnapshotSource): { label: string; className: string; icon: JSX.Element } {
  switch (source) {
    case 'export':
      return { label: '导出', className: 'bg-blue-900/30 text-blue-300 border-blue-700/40', icon: <Download size={8} /> };
    case 'import':
      return { label: '导入', className: 'bg-emerald-900/30 text-emerald-300 border-emerald-700/40', icon: <Upload size={8} /> };
    case 'auto-save':
      return { label: '自动', className: 'bg-purple-900/30 text-purple-300 border-purple-700/40', icon: <Clock size={8} /> };
    case 'preset':
      return { label: '预设', className: 'bg-amber-900/30 text-amber-300 border-amber-700/40', icon: <Tag size={8} /> };
    case 'manual':
      return { label: '手工', className: 'bg-cyan-900/30 text-cyan-300 border-cyan-700/40', icon: <Save size={8} /> };
    default:
      return { label: source, className: 'bg-gray-700/40 text-gray-300 border-gray-600/40', icon: <Info size={8} /> };
  }
}

function getHeatmapLevelBadge(level: string): { label: string; className: string } {
  switch (level) {
    case 'high':
      return { label: '高频', className: 'bg-red-900/30 text-red-300 border border-red-700/40' };
    case 'medium':
      return { label: '中频', className: 'bg-amber-900/30 text-amber-300 border border-amber-700/40' };
    case 'low':
      return { label: '低频', className: 'bg-blue-900/30 text-blue-300 border border-blue-700/40' };
    case 'mixed':
      return { label: '混合', className: 'bg-purple-900/30 text-purple-300 border border-purple-700/40' };
    case 'none':
    default:
      return { label: '无', className: 'bg-gray-800/40 text-gray-400 border border-gray-700/40' };
  }
}

export default function SnapshotArchive() {
  const snapshotInputRef = useRef<HTMLInputElement>(null);
  const archiveEntries = useWarehouseStore((s) => s.archive.entries);
  const undoStackSize = useWarehouseStore((s) => s.archive.undoStack.length);
  const lastAutoSaveId = useWarehouseStore((s) => s.archive.lastAutoSaveId);
  const importWarnings = useWarehouseStore((s) => s.importWarnings);

  const saveToArchive = useWarehouseStore((s) => s.saveToArchive);
  const restoreFromArchive = useWarehouseStore((s) => s.restoreFromArchive);
  const deleteArchiveEntry = useWarehouseStore((s) => s.deleteArchiveEntry);
  const clearArchive = useWarehouseStore((s) => s.clearArchive);
  const undoLastImport = useWarehouseStore((s) => s.undoLastImport);
  const exportArchiveEntry = useWarehouseStore((s) => s.exportArchiveEntry);
  const importSnapshotWithArchive = useWarehouseStore((s) => s.importSnapshotWithArchive);
  const clearImportWarnings = useWarehouseStore((s) => s.clearImportWarnings);
  const addPlaybackLog = useWarehouseStore((s) => s.addPlaybackLog);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [mergeBookmarks, setMergeBookmarks] = useState(false);
  const [showImportLogs, setShowImportLogs] = useState<string | null>(null);

  function showMessage(type: 'success' | 'error' | 'warning', text: string) {
    setResultMessage({ type, text });
    setTimeout(() => setResultMessage(null), 4000);
  }

  function handleManualSave() {
    const entry = saveToArchive('manual');
    if (entry) {
      showMessage('success', `已手工保存快照: ${entry.fileName}`);
    } else {
      showMessage('error', '手工保存失败');
    }
  }

  function handleRestore(entryId: string, fileName: string) {
    const result = restoreFromArchive(entryId);
    if (result.success) {
      showMessage('success', `已恢复快照: ${fileName}（可撤销）`);
    } else {
      showMessage('error', result.error || '恢复失败');
    }
  }

  function handleDelete(entryId: string, fileName: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (deleteArchiveEntry(entryId)) {
      showMessage('warning', `已删除: ${fileName}`);
    }
  }

  function handleExportEntry(entryId: string, e: React.MouseEvent) {
    e.stopPropagation();
    exportArchiveEntry(entryId);
  }

  function handleUndo() {
    const result = undoLastImport();
    if (result) {
      showMessage('success', '已撤销导入，恢复到前一状态');
    } else {
      showMessage('warning', '撤销栈为空，无可撤销内容');
    }
  }

  function handleClearAll() {
    if (archiveEntries.length === 0) return;
    if (confirm(`确定要清空全部 ${archiveEntries.length} 条快照归档记录吗？此操作不可撤销。`)) {
      clearArchive();
      showMessage('warning', '归档中心已清空');
    }
  }

  function handleSnapshotUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        setResultMessage(null);
        const data = JSON.parse(ev.target?.result as string);
        const result = importSnapshotWithArchive(data, file.name, mergeBookmarks);
        if (result.success) {
          const restoredCount = Object.values(result.restored).filter(Boolean).length;
          const parts: string[] = [`成功恢复 ${restoredCount}/9 项状态`];
          if (result.warnings.length > 0) parts.push(`${result.warnings.length} 条警告`);
          if (result.canUndo) parts.push('可撤销');
          showMessage(result.warnings.length > 0 ? 'warning' : 'success', `${file.name}: ${parts.join('，')}`);
        } else {
          showMessage('error', `${file.name}: ${result.error || '导入失败'}`);
        }
      } catch {
        showMessage('error', `${file.name}: 文件格式错误，请上传有效的 JSON 文件`);
      }
    };
    reader.onerror = () => {
      showMessage('error', `${file.name}: 文件读取失败`);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function getWarningIcon(type: string) {
    switch (type) {
      case 'bookmark_not_found':
      case 'unknown_bookmark':
        return <AlertCircle size={10} className="text-orange-400 shrink-0 mt-0.5" />;
      case 'duplicate_bookmark_name':
        return <AlertTriangle size={10} className="text-amber-400 shrink-0 mt-0.5" />;
      case 'missing_field':
        return <AlertCircle size={10} className="text-yellow-400 shrink-0 mt-0.5" />;
      case 'unknown_field':
        return <AlertTriangle size={10} className="text-blue-400 shrink-0 mt-0.5" />;
      case 'version_mismatch':
        return <AlertCircle size={10} className="text-purple-400 shrink-0 mt-0.5" />;
      default:
        return <AlertCircle size={10} className="text-gray-400 shrink-0 mt-0.5" />;
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
          <Archive size={12} className="text-[#00d4ff]" />
          快照归档中心
        </h3>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-gray-500 px-1.5 py-0.5 bg-gray-800/50 rounded">
            {archiveEntries.length}/30
          </span>
          {undoStackSize > 0 && (
            <button
              onClick={handleUndo}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] bg-amber-900/30 text-amber-300 hover:bg-amber-900/50 border border-amber-700/40 rounded transition-colors"
              title={`撤销最近 ${undoStackSize} 次导入`}
            >
              <Undo2 size={9} />
              撤销({undoStackSize})
            </button>
          )}
        </div>
      </div>

      {resultMessage && (
        <div
          className={`flex items-start gap-2 px-2.5 py-2 rounded-lg text-xs border ${
            resultMessage.type === 'success'
              ? 'bg-emerald-900/20 border-emerald-700/40'
              : resultMessage.type === 'error'
              ? 'bg-red-900/20 border-red-700/40'
              : 'bg-amber-900/20 border-amber-700/40'
          }`}
        >
          {resultMessage.type === 'success' ? (
            <CheckCircle size={13} className="text-emerald-400 shrink-0 mt-0.5" />
          ) : resultMessage.type === 'error' ? (
            <AlertCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
          )}
          <span
            className={`flex-1 leading-relaxed ${
              resultMessage.type === 'success'
                ? 'text-emerald-300'
                : resultMessage.type === 'error'
                ? 'text-red-300'
                : 'text-amber-300'
            }`}
          >
            {resultMessage.text}
          </span>
          <button onClick={() => setResultMessage(null)} className="text-gray-500 hover:text-gray-300 shrink-0">
            <X size={12} />
          </button>
        </div>
      )}

      {importWarnings.length > 0 && (
        <div className="space-y-1 max-h-36 overflow-y-auto">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1 text-[10px] text-yellow-400 font-medium">
              <AlertTriangle size={10} />
              <span>最近导入警告 ({importWarnings.length})</span>
            </div>
            <button
              onClick={() => {
                clearImportWarnings();
              }}
              className="text-[10px] text-gray-500 hover:text-gray-300 underline"
            >
              清除
            </button>
          </div>
          {importWarnings.slice(0, 5).map((w, i) => (
            <div key={`iw-${i}`} className="px-2 py-1.5 bg-yellow-900/10 border border-yellow-700/30 rounded text-[10px] space-y-0.5">
              <div className="flex items-center gap-1.5">
                {getWarningIcon(w.type)}
                <span className="text-yellow-300 font-medium">{w.type}</span>
              </div>
              <p className="text-gray-400 pl-3.5 leading-relaxed">{w.message}</p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={mergeBookmarks}
              onChange={(e) => setMergeBookmarks(e.target.checked)}
              className="w-3 h-3 accent-[#00d4ff]"
            />
            合并现有书签
          </label>
        </div>

        <button
          onClick={() => snapshotInputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-900/20 hover:bg-emerald-900/30 border border-emerald-700/40 hover:border-emerald-600/50 rounded-lg text-sm text-emerald-300 transition-all"
        >
          <Upload size={14} />
          导入快照文件
        </button>
        <input
          ref={snapshotInputRef}
          type="file"
          accept=".json"
          onChange={handleSnapshotUpload}
          className="hidden"
        />

        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={handleManualSave}
            className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-[#00d4ff]/10 hover:bg-[#00d4ff]/20 border border-[#00d4ff]/30 hover:border-[#00d4ff]/50 rounded text-xs text-[#00d4ff] transition-all"
          >
            <Save size={11} />
            保存当前
          </button>
          <button
            onClick={handleClearAll}
            disabled={archiveEntries.length === 0}
            className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-red-900/15 hover:bg-red-900/25 border border-red-700/30 hover:border-red-700/50 rounded text-xs text-red-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Trash2 size={11} />
            清空全部
          </button>
        </div>
      </div>

      <div className="h-px bg-[#2a3a4e]" />

      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] text-gray-500">最近快照记录</span>
          {lastAutoSaveId && (
            <span className="text-[9px] text-purple-400 flex items-center gap-0.5">
              <Clock size={8} />
              自动保存已启用
            </span>
          )}
        </div>

        {archiveEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Archive size={28} className="text-gray-700 mb-2" />
            <p className="text-[10px] text-gray-500">暂无归档快照</p>
            <p className="text-[9px] text-gray-600 mt-1 leading-relaxed">
              导出、导入或手工保存后，
              <br />
              快照会出现在这里
            </p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
            {archiveEntries.map((entry) => (
              <ArchiveEntryCard
                key={entry.id}
                entry={entry}
                isExpanded={expandedId === entry.id}
                isLatest={archiveEntries[0]?.id === entry.id}
                isAutoSave={entry.id === lastAutoSaveId}
                showImportLogs={showImportLogs === entry.id}
                onToggleExpand={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                onToggleLogs={() => setShowImportLogs(showImportLogs === entry.id ? null : entry.id)}
                onRestore={() => handleRestore(entry.id, entry.fileName)}
                onDelete={(e) => handleDelete(entry.id, entry.fileName, e)}
                onExport={(e) => handleExportEntry(entry.id, e)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface ArchiveEntryCardProps {
  entry: SnapshotArchiveEntry;
  isExpanded: boolean;
  isLatest: boolean;
  isAutoSave: boolean;
  showImportLogs: boolean;
  onToggleExpand: () => void;
  onToggleLogs: () => void;
  onRestore: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onExport: (e: React.MouseEvent) => void;
}

function ArchiveEntryCard({
  entry,
  isExpanded,
  isLatest,
  isAutoSave,
  showImportLogs,
  onToggleExpand,
  onToggleLogs,
  onRestore,
  onDelete,
  onExport,
}: ArchiveEntryCardProps) {
  const sourceBadge = getSourceBadge(entry.source);
  const heatmapBadge = getHeatmapLevelBadge(entry.summary.heatmapLevel);

  return (
    <div
      className={`rounded-lg border transition-all overflow-hidden ${
        isLatest
          ? 'bg-[#00d4ff]/5 border-[#00d4ff]/30 hover:border-[#00d4ff]/50'
          : 'bg-[#1a2332]/50 border-[#2a3a4e] hover:border-[#3a4f6a]'
      }`}
    >
      <div
        className="flex items-start gap-2 px-2.5 py-2 cursor-pointer"
        onClick={onToggleExpand}
      >
        <button className="mt-0.5 text-gray-500 hover:text-gray-300 shrink-0">
          {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <FileJson size={11} className="text-gray-400 shrink-0" />
            <span
              className={`text-[11px] font-medium truncate ${
                isLatest ? 'text-[#00d4ff]' : 'text-gray-200'
              }`}
              title={entry.fileName}
            >
              {entry.fileName}
            </span>
            {isLatest && (
              <span className="px-1 py-0.5 text-[8px] bg-[#00d4ff]/20 text-[#00d4ff] rounded border border-[#00d4ff]/30">
                最近
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            <span
              className={`inline-flex items-center gap-0.5 px-1 py-0.5 text-[8px] rounded border ${sourceBadge.className}`}
            >
              {sourceBadge.icon}
              {sourceBadge.label}
            </span>
            <span
              className={`inline-flex items-center gap-0.5 px-1 py-0.5 text-[8px] rounded ${heatmapBadge.className}`}
            >
              {heatmapBadge.label}
            </span>
            {isAutoSave && (
              <span className="inline-flex items-center gap-0.5 px-1 py-0.5 text-[8px] rounded bg-purple-900/30 text-purple-300 border border-purple-700/40">
                <Clock size={7} />
                自动存
              </span>
            )}
            <span className="text-[8px] text-gray-500 flex items-center gap-0.5">
              <Layers size={7} />
              v{entry.schemaVersion}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1 text-[9px] text-gray-500">
            <span className="flex items-center gap-0.5">
              <Clock size={7} />
              {formatDate(entry.savedAt)}
            </span>
            <span className="flex items-center gap-0.5">
              <MapPin size={7} />
              {entry.summary.locationsCount}
            </span>
            <span>{entry.summary.pickRecordsCount}单</span>
            {entry.summary.bookmarksCount > 0 && (
              <span className="text-blue-400">📌{entry.summary.bookmarksCount}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onRestore}
            className="p-1 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-900/30 rounded transition-colors"
            title="恢复此快照"
          >
            <Play size={11} />
          </button>
          <button
            onClick={onExport}
            className="p-1 text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 rounded transition-colors"
            title="导出为文件"
          >
            <Download size={11} />
          </button>
          <button
            onClick={onDelete}
            className="p-1 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors"
            title="删除此记录"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="px-2.5 pb-2.5 space-y-2 border-t border-[#2a3a4e] pt-2 ml-3">
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="space-y-0.5">
              <p className="text-gray-500 flex items-center gap-1">
                <MapPin size={8} />
                货位数量
              </p>
              <p className="text-gray-200 font-medium">{entry.summary.locationsCount}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-gray-500 flex items-center gap-1">
                <FileJson size={8} />
                拣货记录
              </p>
              <p className="text-gray-200 font-medium">{entry.summary.pickRecordsCount}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-gray-500 flex items-center gap-1">
                <RotateCcw size={8} />
                书签数量
              </p>
              <p className="text-gray-200 font-medium">{entry.summary.bookmarksCount}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-gray-500 flex items-center gap-1">
                <Tag size={8} />
                活跃书签
              </p>
              <p className="text-gray-200 font-medium truncate">
                {entry.summary.activeBookmarkName || '-'}
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-[9px] text-gray-500 flex items-center gap-1">
              <Layers size={8} />
              覆盖区域 ({entry.summary.zones.length})
            </p>
            {entry.summary.zones.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {entry.summary.zones.map((z) => (
                  <span
                    key={z}
                    className="px-1.5 py-0.5 text-[9px] bg-[#1e2d42] text-gray-300 rounded border border-[#2a3a4e]"
                  >
                    {z}区
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-gray-600">无区域信息</p>
            )}
          </div>

          <div className="space-y-1">
            <p className="text-[9px] text-gray-500 flex items-center gap-1">
              <Calendar size={8} />
              日期筛选
            </p>
            <p className={`text-[10px] ${entry.summary.hasDateFilter ? 'text-blue-300' : 'text-gray-600'}`}>
              {entry.summary.hasDateFilter ? '已启用日期范围筛选' : '未启用日期筛选'}
            </p>
          </div>

          {entry.importLogs && entry.importLogs.length > 0 && (
            <div className="space-y-1 border-t border-[#2a3a4e] pt-2">
              <button
                onClick={onToggleLogs}
                className="flex items-center gap-1 text-[9px] text-gray-400 hover:text-gray-200"
              >
                {showImportLogs ? <ChevronDown size={8} /> : <ChevronRight size={8} />}
                导入日志 ({entry.importLogs.length})
              </button>
              {showImportLogs && (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {entry.importLogs.map((log) => (
                    <div
                      key={log.id}
                      className={`px-2 py-1 rounded text-[9px] border ${
                        log.level === 'error'
                          ? 'bg-red-900/15 border-red-800/30 text-red-300'
                          : log.level === 'warning'
                          ? 'bg-amber-900/15 border-amber-800/30 text-amber-300'
                          : log.level === 'success'
                          ? 'bg-emerald-900/15 border-emerald-800/30 text-emerald-300'
                          : 'bg-blue-900/15 border-blue-800/30 text-blue-300'
                      }`}
                    >
                      <p className="font-medium">{log.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
