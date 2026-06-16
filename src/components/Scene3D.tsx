import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Suspense } from 'react';
import WarehouseScene from './3d/WarehouseScene';
import { useWarehouseStore } from '@/store/warehouseStore';
import LocationTooltip from './LocationTooltip';

declare global {
  interface Window {
    __warehouseCamera?: { position: [number, number, number]; target: [number, number, number] };
  }
}

function CameraReflector() {
  const { camera } = useThree();
  useFrame(() => {
    window.__warehouseCamera = {
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [0, 0, 0],
    };
  });
  return null;
}

export default function Scene3D() {
  const locations = useWarehouseStore((s) => s.locations);
  const hoveredLocation = useWarehouseStore((s) => s.hoveredLocation);

  return (
    <div className="relative flex-1 h-full">
      <Canvas
        camera={{ position: [22, 16, 24], fov: 50, near: 0.1, far: 200 }}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl, camera }) => {
          gl.toneMapping = 2;
          gl.toneMappingExposure = 1.5;
          camera.lookAt(7.5, 4.5, 7.5);
        }}
      >
        <Suspense fallback={null}>
          <WarehouseScene />
          <CameraReflector />
        </Suspense>
      </Canvas>

      {hoveredLocation && <LocationTooltip locationId={hoveredLocation} />}

      {locations.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="text-6xl mb-4 opacity-20">📦</div>
            <p className="text-gray-500 text-lg">导入布局数据或加载样例数据以查看 3D 热力图</p>
          </div>
        </div>
      )}
    </div>
  );
}
