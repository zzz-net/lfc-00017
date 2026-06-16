import { useRef, useState, useMemo } from 'react';
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
}

export default function LocationBox({ id, x, y, z, color, opacity }: LocationBoxProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const selectionMode = useWarehouseStore((s) => s.replenishment.selectionMode);
  const selectedIds = useWarehouseStore((s) => s.replenishment.selectedLocationIds);
  const activeBatchId = useWarehouseStore((s) => s.replenishment.activeBatchId);
  const batches = useWarehouseStore((s) => s.replenishment.batches);
  const setHoveredLocation = useWarehouseStore((s) => s.setHoveredLocation);
  const toggleLocationSelection = useWarehouseStore((s) => s.toggleLocationSelection);
  const addLocationToBatch = useWarehouseStore((s) => s.addLocationToBatch);

  const isSelected = useMemo(() => selectedIds.includes(id), [selectedIds, id]);

  const occupancyInfo = useMemo(() => {
    for (const batch of batches) {
      if (batch.locations.some((bl) => bl.locationId === id)) {
        return { batchId: batch.id, batchNo: batch.batchNo, priority: batch.priority, isActive: batch.id === activeBatchId };
      }
    }
    return null;
  }, [batches, id, activeBatchId]);

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
    if (selectionMode) {
      document.body.style.cursor = 'pointer';
    }
  };

  const handlePointerOut = () => {
    setHovered(false);
    setHoveredLocation(null);
    targetScale.current.set(1, 1, 1);
    document.body.style.cursor = '';
  };

  const handleClick = (e: any) => {
    e.stopPropagation();
    if (selectionMode) {
      toggleLocationSelection(id);
    } else if (activeBatchId && !occupancyInfo) {
      addLocationToBatch(activeBatchId, id);
    }
  };

  let edgeColor = '#ffffff';
  let edgeOpacity = 0.25;
  let finalOpacity = opacity;
  let finalColor = color;

  if (occupancyInfo) {
    const priorityColors: Record<string, string> = {
      critical: '#ef4444',
      high: '#f97316',
      medium: '#eab308',
      low: '#3b82f6',
    };
    edgeColor = occupancyInfo.isActive ? '#06b6d4' : (priorityColors[occupancyInfo.priority] || '#ffffff');
    edgeOpacity = occupancyInfo.isActive ? 0.9 : 0.6;
    finalOpacity = Math.max(finalOpacity, 0.75);
  }

  if (isSelected) {
    edgeColor = '#06b6d4';
    edgeOpacity = 1.0;
    finalOpacity = 0.95;
  }

  if (hovered && selectionMode) {
    edgeColor = '#f472b6';
    edgeOpacity = 1.0;
  }

  if (hovered && activeBatchId && !occupancyInfo && !selectionMode) {
    edgeColor = '#22c55e';
    edgeOpacity = 0.9;
  }

  const isTransparent = finalOpacity < 0.9;

  return (
    <group>
      <mesh
        ref={meshRef}
        position={[x, y + 1.3, z]}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <boxGeometry args={[3, 2.6, 3]} />
        <meshBasicMaterial
          color={finalColor}
          transparent={isTransparent}
          opacity={finalOpacity}
        />
      </mesh>
      <lineSegments position={[x, y + 1.3, z]}>
        <edgesGeometry args={[new THREE.BoxGeometry(isSelected ? 3.2 : 3.05, isSelected ? 2.8 : 2.65, isSelected ? 3.2 : 3.05)]} />
        <lineBasicMaterial
          color={edgeColor}
          transparent
          opacity={edgeOpacity}
        />
      </lineSegments>
    </group>
  );
}
