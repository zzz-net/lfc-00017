import { useRef, useEffect, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Text } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useWarehouseStore } from '@/store/warehouseStore';
import ShelfGroup from './ShelfGroup';

function CameraController() {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();
  const activeBookmark = useWarehouseStore((s) => s.activeBookmark);
  const cameraBookmarks = useWarehouseStore((s) => s.cameraBookmarks);
  const setActiveBookmark = useWarehouseStore((s) => s.setActiveBookmark);
  const cameraState = useWarehouseStore((s) => s.cameraState);
  const setCameraState = useWarehouseStore((s) => s.setCameraState);
  const targetRef = useRef<THREE.Vector3 | null>(null);
  const animating = useRef(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (controlsRef.current) {
      window.__warehouseOrbitControls = controlsRef.current;
    }
  }, []);

  useEffect(() => {
    if (!initialized.current && controlsRef.current) {
      initialized.current = true;
      const controls = controlsRef.current;
      controls.target.set(...cameraState.target);
      camera.position.set(...cameraState.position);
      controls.update();
    }
  }, [cameraState, camera]);

  useEffect(() => {
    if (activeBookmark) {
      const bm = cameraBookmarks.find((b) => b.id === activeBookmark);
      if (bm) {
        targetRef.current = new THREE.Vector3(...bm.position);
        animating.current = true;
      }
    }
  }, [activeBookmark, cameraBookmarks]);

  useFrame(() => {
    if (animating.current && targetRef.current) {
      camera.position.lerp(targetRef.current, 0.08);
      if (camera.position.distanceTo(targetRef.current) < 0.05) {
        animating.current = false;
        setActiveBookmark(null);
      }
      if (controlsRef.current) {
        controlsRef.current.update();
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      target={cameraState.target as any}
      minDistance={5}
      maxDistance={80}
      maxPolarAngle={Math.PI / 2.1}
      enableDamping
      dampingFactor={0.08}
      onChange={() => {
        if (controlsRef.current && !animating.current) {
          const t = controlsRef.current.target;
          const p = camera.position;
          setCameraState({
            position: [p.x, p.y, p.z],
            target: [t.x, t.y, t.z],
          });
        }
      }}
    />
  );
}

function ZoneLabels() {
  const locations = useWarehouseStore((s) => s.locations);
  const filter = useWarehouseStore((s) => s.filter);

  const zonePositions = useMemo(() => {
    const allZones = [...new Set(locations.map((l) => l.zone))].sort();
    const visibleZones = filter.zones.length === 0 ? allZones : filter.zones;
    
    return visibleZones.map((zone) => {
      const locs = locations.filter((l) => l.zone === zone);
      const cx = locs.reduce((s, l) => s + l.x, 0) / locs.length;
      const cz = locs.reduce((s, l) => s + l.z, 0) / locs.length;
      const minY = Math.min(...locs.map((l) => l.y));
      return { zone, x: cx, y: minY - 1.5, z: cz };
    });
  }, [locations, filter.zones]);

  return (
    <>
      {zonePositions.map(({ zone, x, y, z }) => (
        <Text
          key={zone}
          position={[x, y, z]}
          fontSize={0.6}
          color="#00d4ff"
          anchorX="center"
          anchorY="middle"
        >
          {`区域 ${zone}`}
        </Text>
      ))}
    </>
  );
}

export default function WarehouseScene() {
  const locations = useWarehouseStore((s) => s.locations);

  if (locations.length === 0) {
    return null;
  }

  return (
    <>
      <color attach="background" args={['#0a0f1a']} />
      <fog attach="fog" args={['#0a0f1a', 40, 100]} />

      <ambientLight intensity={0.8} />
      <directionalLight position={[20, 25, 15]} intensity={1.5} color="#ffeedd" />
      <directionalLight position={[-15, 15, -10]} intensity={0.8} color="#aaccff" />
      <pointLight position={[7.5, 10, 7.5]} intensity={1.2} color="#ffffff" />

      <CameraController />

      <Grid
        args={[100, 100]}
        position={[7.5, -0.01, 7.5]}
        cellSize={2}
        cellThickness={0.5}
        cellColor="#1a2a3a"
        sectionSize={10}
        sectionThickness={1}
        sectionColor="#1e3a5f"
        fadeDistance={60}
        fadeStrength={1}
        infiniteGrid
      />

      <ShelfGroup />
      <ZoneLabels />

      <EffectComposer>
        <Bloom
          intensity={0.3}
          luminanceThreshold={0.6}
          luminanceSmoothing={0.9}
        />
      </EffectComposer>
    </>
  );
}
