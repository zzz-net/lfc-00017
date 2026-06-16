import { useState } from 'react';
import { Bookmark, BookmarkPlus, Trash2, Camera } from 'lucide-react';
import { useWarehouseStore } from '@/store/warehouseStore';

function BookmarkAdder() {
  const [name, setName] = useState('');
  const addBookmark = useWarehouseStore((s) => s.addBookmark);

  const handleAdd = () => {
    if (!name.trim()) return;
    const cam = window.__warehouseCamera;
    if (cam) {
      addBookmark({
        id: `bm-${Date.now()}`,
        name: name.trim(),
        position: [...cam.position],
        target: [...cam.target],
      });
    }
    setName('');
  };

  return (
    <div className="flex gap-1.5">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="书签名称"
        className="flex-1 bg-[#0f1419] border border-[#2a3a4e] rounded px-2 py-1.5 text-xs text-gray-300 placeholder-gray-600 focus:border-[#00d4ff]/50 focus:outline-none transition-colors"
        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
      />
      <button
        onClick={handleAdd}
        disabled={!name.trim()}
        className="px-2 py-1.5 bg-[#00d4ff]/10 hover:bg-[#00d4ff]/20 border border-[#00d4ff]/30 rounded text-xs text-[#00d4ff] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        <BookmarkPlus size={14} />
      </button>
    </div>
  );
}

export default function BookmarkPanel() {
  const cameraBookmarks = useWarehouseStore((s) => s.cameraBookmarks);
  const removeBookmark = useWarehouseStore((s) => s.removeBookmark);
  const setActiveBookmark = useWarehouseStore((s) => s.setActiveBookmark);
  const activeBookmark = useWarehouseStore((s) => s.activeBookmark);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">相机书签</h3>
        <Bookmark size={12} className="text-gray-500" />
      </div>

      <BookmarkAdder />

      {cameraBookmarks.length === 0 && (
        <p className="text-[10px] text-gray-600 text-center py-2">暂无书签</p>
      )}

      <div className="space-y-1 max-h-32 overflow-y-auto">
        {cameraBookmarks.map((bm) => (
          <div
            key={bm.id}
            className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-all ${
              activeBookmark === bm.id
                ? 'bg-[#00d4ff]/15 border border-[#00d4ff]/30'
                : 'bg-[#1a2332] border border-transparent hover:border-[#2a3a4e]'
            }`}
          >
            <button
              onClick={() => setActiveBookmark(bm.id)}
              className="flex items-center gap-1.5 text-gray-300 hover:text-[#00d4ff] transition-colors"
            >
              <Camera size={11} />
              {bm.name}
            </button>
            <button
              onClick={() => removeBookmark(bm.id)}
              className="text-gray-600 hover:text-red-400 transition-colors"
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
