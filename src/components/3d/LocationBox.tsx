import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useWarehouseStore } from '@/store/warehouseStore';

interface LocationBoxProps {
  id: string;
  x: number;
  y: number;
  z: number;
  color: string;
  opacity: number;
  isConflict: boolean;
}

export default function LocationBox({ id, x, y, z, color, opacity, isConflict }: LocationBoxProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const { setHoveredLocation } = useWarehouseStore();
  const targetScale = useRef(new THREE.Vector3(1, 1, 1));

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.scale.lerp(targetScale.current, 0.15);
    }
  });

  const handlePointerOver = (e: any) => {
    e.stopPropagation();
    setHovered(true);
    setHoveredLocation(id);
    targetScale.current.set(1.12, 1.12, 1.12);
  };

  const handlePointerOut = () => {
    setHovered(false);
    setHoveredLocation(null);
    targetScale.current.set(1, 1, 1);
  };

  const finalOpacity = isConflict ? Math.min(opacity, 0.6) : opacity;
  const isTransparent = isConflict || opacity < 0.9;

  return (
    <mesh
      ref={meshRef}
      position={[x, y + 1.3, z]}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <boxGeometry args={[3, 2.6, 3]} />
      <meshBasicMaterial
        color={color}
        transparent={isTransparent}
        opacity={finalOpacity}
      />
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(3.05, 2.65, 3.05)]} />
        <lineBasicMaterial color="#ffffff" transparent opacity={0.25} />
      </lineSegments>
      {isConflict && (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(3.2, 2.8, 3.2)]} />
          <lineBasicMaterial color="#f59e0b" />
        </lineSegments>
      )}
    </mesh>
  );
}
