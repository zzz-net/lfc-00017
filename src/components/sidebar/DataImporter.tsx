import { useRef } from 'react';
import { Upload, Database } from 'lucide-react';
import { useWarehouseStore } from '@/store/warehouseStore';
import type { LayoutData, PicksData } from '@/types/warehouse';

export default function DataImporter() {
  const layoutInputRef = useRef<HTMLInputElement>(null);
  const picksInputRef = useRef<HTMLInputElement>(null);
  const { setLocations, setPickRecords, loadSampleData } = useWarehouseStore();

  const handleLayoutUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data: LayoutData = JSON.parse(ev.target?.result as string);
        if (data.locations && Array.isArray(data.locations)) {
          setLocations(data.locations);
        }
      } catch {
        alert('布局文件格式错误，请上传有效的 JSON 文件');
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
        const data: PicksData = JSON.parse(ev.target?.result as string);
        if (data.records && Array.isArray(data.records)) {
          setPickRecords(data.records);
        }
      } catch {
        alert('拣货记录文件格式错误，请上传有效的 JSON 文件');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">数据导入</h3>
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
