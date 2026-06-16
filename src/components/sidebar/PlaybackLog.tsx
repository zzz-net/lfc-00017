import { ScrollText, Info, AlertTriangle, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { useWarehouseStore } from '@/store/warehouseStore';
import type { PlaybackLogLevel } from '@/types/warehouse';

function getLevelIcon(level: PlaybackLogLevel) {
  switch (level) {
    case 'success':
      return <CheckCircle size={11} className="text-emerald-400" />;
    case 'warning':
      return <AlertTriangle size={11} className="text-amber-400" />;
    case 'error':
      return <XCircle size={11} className="text-red-400" />;
    case 'info':
    default:
      return <Info size={11} className="text-sky-400" />;
  }
}

function getLevelBadge(level: PlaybackLogLevel) {
  switch (level) {
    case 'success':
      return 'bg-emerald-900/30 text-emerald-300 border-emerald-700/40';
    case 'warning':
      return 'bg-amber-900/30 text-amber-300 border-amber-700/40';
    case 'error':
      return 'bg-red-900/30 text-red-300 border-red-700/40';
    case 'info':
    default:
      return 'bg-sky-900/30 text-sky-300 border-sky-700/40';
  }
}

export default function PlaybackLog() {
  const logs = useWarehouseStore((s) => s.playback.logs);
  const clearPlaybackLogs = useWarehouseStore((s) => s.clearPlaybackLogs);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
          <ScrollText size={12} />
          导入/操作日志
        </h3>
        {logs.length > 0 && (
          <button
            onClick={clearPlaybackLogs}
            className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-red-400 transition-colors"
          >
            <Trash2 size={10} />
            清除
          </button>
        )}
      </div>

      {logs.length === 0 && (
        <p className="text-[10px] text-gray-600 text-center py-3">暂无操作记录</p>
      )}

      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {logs.map((log) => (
          <div
            key={log.id}
            className={`px-2 py-1.5 border rounded ${getLevelBadge(log.level)}`}
          >
            <div className="flex items-start gap-1.5">
              <span className="shrink-0 mt-0.5">{getLevelIcon(log.level)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] leading-relaxed break-words">{log.message}</p>
                <p className="text-[9px] opacity-60 mt-0.5">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
