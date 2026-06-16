import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, PlayCircle, Warehouse } from 'lucide-react';

export default function TopNav() {
  const location = useLocation();

  const links = [
    { to: '/', label: '主页', icon: LayoutDashboard, pageId: 'home' },
    { to: '/playback', label: '验收回放台', icon: PlayCircle, pageId: 'playback' },
  ];

  const currentPageId = location.pathname === '/playback' ? 'playback' : 'home';

  return (
    <div className="absolute top-0 left-0 right-0 z-20 h-11 bg-[#0f1419]/90 backdrop-blur border-b border-[#2a3a4e] flex items-center px-4 gap-1">
      <div className="flex items-center gap-2 mr-4">
        <Warehouse size={16} className="text-[#00d4ff]" />
        <span className="text-sm font-semibold text-gray-200">仓储 3D 热力图</span>
        <span className="px-1.5 py-0.5 text-[9px] bg-[#00d4ff]/15 text-[#00d4ff] border border-[#00d4ff]/30 rounded">
          pageId: {currentPageId}
        </span>
      </div>
      <div className="flex items-center gap-1">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = (link.to === '/' && location.pathname === '/') ||
            (link.to !== '/' && location.pathname.startsWith(link.to));
          return (
            <NavLink
              key={link.to}
              to={link.to}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                isActive
                  ? 'bg-[#00d4ff]/15 text-[#00d4ff] border border-[#00d4ff]/30'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-[#1a2332] border border-transparent'
              }`}
            >
              <Icon size={12} />
              {link.label}
            </NavLink>
          );
        })}
      </div>
      <div className="ml-auto text-[10px] text-gray-500">
        {'快照文件名规则: warehouse-snapshot[-{presetId}]-YYYY-MM-DD-HHMMSS.json'}
      </div>
    </div>
  );
}
