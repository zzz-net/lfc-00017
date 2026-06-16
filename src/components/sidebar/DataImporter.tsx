import { useRef, useState } from 'react';
import { Upload, Database, Camera, AlertCircle, X, CheckCircle, AlertTriangle } from 'lucide-react';
import { useWarehouseStore } from '@/store/warehouseStore';
import type { LayoutData, PicksData, SnapshotData, ImportWarning } from '@/types/warehouse';

export default function DataImporter() {
  const layoutInputRef = useRef<HTMLInputElement>(null);
  const picksInputRef = useRef<HTMLInputElement>(null);
  const snapshotInputRef = useRef<HTMLInputElement>(null);
  const { setLocations, setPickRecords, loadSampleData, importSnapshotWithArchive, importConflicts, importWarnings, clearImportConflicts, clearImportWarnings } = useWarehouseStore();

  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [showWarnings, setShowWarnings] = useState(false);

  const handleLayoutUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        setImportError(null);
        const data: LayoutData = JSON.parse(ev.target?.result as string);
        if (data.locations && Array.isArray(data.locations)) {
          const conflicts = setLocations(data.locations);
          if (conflicts.length > 0) {
            const rows = conflicts.map((c) => `行${c.row}`).join(', ');
            setImportError(`布局导入: ${conflicts.length} 处坐标冲突 (${rows})，${conflicts.reduce((s, c) => s + c.rejectedIds.length, 0)} 个货位已拒绝`);
          }
        } else {
          setImportError('布局文件缺少 locations 数组');
        }
      } catch {
        setImportError('布局文件格式错误，请上传有效的 JSON 文件');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handlePicksUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        setImportError(null);
        const data: PicksData = JSON.parse(ev.target?.result as string);
        if (data.records && Array.isArray(data.records)) {
          setPickRecords(data.records);
        } else {
          setImportError('拣货记录文件缺少 records 数组');
        }
      } catch {
        setImportError('拣货记录文件格式错误，请上传有效的 JSON 文件');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSnapshotUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        setImportError(null);
        setImportSuccess(null);
        setShowWarnings(false);
        const data = JSON.parse(ev.target?.result as string);
        const result = importSnapshotWithArchive(data, file.name, false);
        if (!result.success) {
          setImportError(result.error ?? '快照导入失败');
        } else {
          const parts: string[] = [];
          const restoredCount = Object.values(result.restored).filter(Boolean).length;
          parts.push(`成功恢复 ${restoredCount}/9 项状态`);

          if (result.warnings.length > 0) {
            parts.push(`${result.warnings.length} 条警告`);
            setShowWarnings(true);
          }
          if (importConflicts.length > 0) {
            parts.push(`${importConflicts.length} 处坐标冲突已过滤`);
          }
          if (result.canUndo) {
            parts.push('可撤销');
          }

          setImportSuccess(parts.join('，'));
        }
      } catch {
        setImportError('快照文件格式错误，请上传有效的 JSON 文件');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  function getWarningIcon(type: ImportWarning['type']) {
    switch (type) {
      case 'bookmark_not_found':
      case 'unknown_bookmark':
        return <AlertCircle size={10} className="text-orange-400" />;
      case 'duplicate_bookmark_name':
        return <AlertTriangle size={10} className="text-amber-400" />;
      case 'missing_field':
        return <AlertCircle size={10} className="text-yellow-400" />;
      case 'unknown_field':
        return <AlertTriangle size={10} className="text-blue-400" />;
      case 'version_mismatch':
        return <AlertCircle size={10} className="text-purple-400" />;
      default:
        return <AlertCircle size={10} className="text-gray-400" />;
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">数据导入</h3>

      {importError && (
        <div className="flex items-start gap-2 px-2.5 py-2 bg-amber-900/20 border border-amber-700/40 rounded-lg text-xs">
          <AlertCircle size={13} className="text-amber-400 shrink-0 mt-0.5" />
          <span className="text-amber-300 flex-1 leading-relaxed">{importError}</span>
          <button onClick={() => setImportError(null)} className="text-amber-500 hover:text-amber-300 shrink-0">
            <X size={12} />
          </button>
        </div>
      )}

      {importSuccess && (
        <div className="flex items-start gap-2 px-2.5 py-2 bg-emerald-900/20 border border-emerald-700/40 rounded-lg text-xs">
          <CheckCircle size={13} className="text-emerald-400 shrink-0 mt-0.5" />
          <span className="text-emerald-300 flex-1 leading-relaxed">{importSuccess}</span>
          <button onClick={() => setImportSuccess(null)} className="text-emerald-500 hover:text-emerald-300 shrink-0">
            <X size={12} />
          </button>
        </div>
      )}

      {showWarnings && importWarnings.length > 0 && (
        <div className="space-y-1 max-h-36 overflow-y-auto">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1 text-[10px] text-yellow-400 font-medium">
              <AlertTriangle size={10} />
              <span>导入警告 ({importWarnings.length})</span>
            </div>
            <button
              onClick={() => {
                clearImportWarnings();
                setShowWarnings(false);
              }}
              className="text-[10px] text-gray-500 hover:text-gray-300 underline"
            >
              清除
            </button>
          </div>
          {importWarnings.map((w, i) => (
            <div key={`w-${i}`} className="px-2 py-1.5 bg-yellow-900/10 border border-yellow-700/30 rounded text-[10px] space-y-0.5">
              <div className="flex items-center gap-1.5">
                {getWarningIcon(w.type)}
                <span className="text-yellow-300 font-medium">{w.type}</span>
              </div>
              <p className="text-gray-400 pl-3.5">{w.message}</p>
            </div>
          ))}
        </div>
      )}

      {importConflicts.length > 0 && (
        <div className="space-y-1 max-h-28 overflow-y-auto">
          {importConflicts.map((c, i) => (
            <div key={`ic-${i}`} className="px-2 py-1.5 bg-red-900/15 border border-red-700/30 rounded text-[10px] space-y-0.5">
              <div className="flex items-center gap-1 text-red-400 font-medium">
                <AlertCircle size={10} />
                <span>行 {c.row} 坐标冲突</span>
              </div>
              <p className="text-gray-400 pl-3.5">{c.message}</p>
              <div className="flex flex-wrap gap-1 pl-3.5">
                {c.rejectedIds.map((id) => (
                  <span key={id} className="px-1 py-0.5 bg-red-900/30 text-red-300 rounded font-mono text-[9px]">{id}</span>
                ))}
              </div>
            </div>
          ))}
          <button
            onClick={clearImportConflicts}
            className="text-[10px] text-gray-500 hover:text-gray-300 underline"
          >
            清除冲突记录
          </button>
        </div>
      )}

      <div className="space-y-1.5">
        <button
          onClick={() => layoutInputRef.current?.click()}
          className="w-full flex items-center gap-2 px-3 py-2 bg-[#1a2332] hover:bg-[#1e2d42] border border-[#2a3a4e] hover:border-[#00d4ff]/40 rounded-lg text-sm text-gray-300 transition-all"
        >
          <Upload size={14} />
          导入布局
        </button>
        <input
          ref={layoutInputRef}
          type="file"
          accept=".json"
          onChange={handleLayoutUpload}
          className="hidden"
        />

        <button
          onClick={() => picksInputRef.current?.click()}
          className="w-full flex items-center gap-2 px-3 py-2 bg-[#1a2332] hover:bg-[#1e2d42] border border-[#2a3a4e] hover:border-[#00d4ff]/40 rounded-lg text-sm text-gray-300 transition-all"
        >
          <Upload size={14} />
          导入拣货记录
        </button>
        <input
          ref={picksInputRef}
          type="file"
          accept=".json"
          onChange={handlePicksUpload}
          className="hidden"
        />

        <button
          onClick={() => snapshotInputRef.current?.click()}
          className="w-full flex items-center gap-2 px-3 py-2 bg-[#1a2332] hover:bg-[#1e2d42] border border-[#2a3a4e] hover:border-[#00d4ff]/40 rounded-lg text-sm text-gray-300 transition-all"
        >
          <Camera size={14} />
          导入快照
        </button>
        <input
          ref={snapshotInputRef}
          type="file"
          accept=".json"
          onChange={handleSnapshotUpload}
          className="hidden"
        />

        <button
          onClick={loadSampleData}
          className="w-full flex items-center gap-2 px-3 py-2 bg-[#00d4ff]/10 hover:bg-[#00d4ff]/20 border border-[#00d4ff]/30 hover:border-[#00d4ff]/50 rounded-lg text-sm text-[#00d4ff] transition-all"
        >
          <Database size={14} />
          加载样例数据
        </button>
      </div>
    </div>
  );
}
