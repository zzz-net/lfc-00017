import { Play, CheckCircle2, AlertCircle } from 'lucide-react';
import { useWarehouseStore } from '@/store/warehouseStore';
import { demoPresets } from '@/data/demoPresets';
import { useState } from 'react';

export default function DemoPresets() {
  const loadDemoPreset = useWarehouseStore((s) => s.loadDemoPreset);
  const activePresetId = useWarehouseStore((s) => s.playback.activePresetId);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [resultMsg, setResultMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleLoad = async (presetId: string) => {
    setLoadingId(presetId);
    setResultMsg(null);
    const result = loadDemoPreset(presetId);
    setLoadingId(null);
    if (result) {
      if (result.success) {
        const restoredCount = Object.values(result.restored).filter(Boolean).length;
        setResultMsg({
          type: 'success',
          text: `装载成功: 恢复 ${restoredCount}/9 项状态，${result.warnings.length} 条警告`,
        });
      } else {
        setResultMsg({ type: 'error', text: result.error ?? '装载失败' });
      }
    } else {
      setResultMsg({ type: 'error', text: '预设不存在' });
    }
    setTimeout(() => setResultMsg(null), 4000);
  };

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">验收演示样例</h3>

      {resultMsg && (
        <div
          className={`flex items-start gap-2 px-2.5 py-2 border rounded-lg text-xs ${
            resultMsg.type === 'success'
              ? 'bg-emerald-900/20 border-emerald-700/40'
              : 'bg-red-900/20 border-red-700/40'
          }`}
        >
          {resultMsg.type === 'success' ? (
            <CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
          )}
          <span
            className={`flex-1 leading-relaxed ${
              resultMsg.type === 'success' ? 'text-emerald-300' : 'text-red-300'
            }`}
          >
            {resultMsg.text}
          </span>
        </div>
      )}

      <div className="space-y-1.5">
        {demoPresets.map((preset) => {
          const isActive = activePresetId === preset.id;
          const isLoading = loadingId === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => handleLoad(preset.id)}
              disabled={isLoading}
              className={`w-full text-left px-3 py-2.5 border rounded-lg transition-all ${
                isActive
                  ? 'bg-[#00d4ff]/15 border-[#00d4ff]/40'
                  : 'bg-[#1a2332] border-[#2a3a4e] hover:border-[#00d4ff]/30 hover:bg-[#1e2d42]'
              } disabled:opacity-50`}
            >
              <div className="flex items-center gap-2">
                <Play
                  size={13}
                  className={isActive ? 'text-[#00d4ff]' : 'text-gray-400'}
                />
                <span
                  className={`text-sm font-medium ${
                    isActive ? 'text-[#00d4ff]' : 'text-gray-200'
                  }`}
                >
                  {preset.name}
                </span>
                {isActive && (
                  <span className="ml-auto px-1.5 py-0.5 text-[9px] bg-[#00d4ff]/20 text-[#00d4ff] rounded">
                    当前
                  </span>
                )}
              </div>
              <p className="mt-1 text-[10px] text-gray-500 leading-relaxed pl-5">
                {preset.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
