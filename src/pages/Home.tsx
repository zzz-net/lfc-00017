import Sidebar from '@/components/Sidebar';
import Scene3D from '@/components/Scene3D';

export default function Home() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0a0f1a]">
      <Sidebar />
      <div className="flex-1 relative">
        <Scene3D />
      </div>
    </div>
  );
}
