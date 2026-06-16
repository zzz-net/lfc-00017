import { useMemo } from 'react';
import * as THREE from 'three';
import { useWarehouseStore } from '@/store/warehouseStore';
import LocationBox from './LocationBox';

export default function ShelfGroup() {
  const locations = useWarehouseStore((s) => s.locations);
  const filter = useWarehouseStore((s) => s.filter);
  const thresholds = useWarehouseStore((s) => s.thresholds);

  const heatMap = useMemo(
    () => useWarehouseStore.getState().getHeatMap(),
    [locations, filter, thresholds]
  );

  const visibleLocations = useMemo(() => {
    if (filter.zones.length === 0) return locations;
    return locations.filter((l) => filter.zones.includes(l.zone));
  }, [locations, filter.zones]);

  const frameLines = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const zones = new Map<string, { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number }>();

    const frameLocations = filter.zones.length === 0
      ? locations
      : locations.filter((l) => filter.zones.includes(l.zone));

    for (const loc of frameLocations) {
      const z = zones.get(loc.zone);
      if (!z) {
        zones.set(loc.zone, {
          minX: loc.x, maxX: loc.x + 3, minZ: loc.z, maxZ: loc.z + 3, maxY: loc.y + 3,
        });
      } else {
        z.minX = Math.min(z.minX, loc.x);
        z.maxX = Math.max(z.maxX, loc.x + 3);
        z.minZ = Math.min(z.minZ, loc.z);
        z.maxZ = Math.max(z.maxZ, loc.z + 3);
        z.maxY = Math.max(z.maxY, loc.y + 3);
      }
    }

    for (const [, b] of zones) {
      const corners = [
        [b.minX, 0, b.minZ], [b.maxX, 0, b.minZ],
        [b.maxX, 0, b.maxZ], [b.minX, 0, b.maxZ],
        [b.minX, b.maxY, b.minZ], [b.maxX, b.maxY, b.minZ],
        [b.maxX, b.maxY, b.maxZ], [b.minX, b.maxY, b.maxZ],
      ] as [number, number, number][];

      const edges: [number, number][] = [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7],
      ];

      for (const [a, bIdx] of edges) {
        points.push(
          new THREE.Vector3(...corners[a]),
          new THREE.Vector3(...corners[bIdx])
        );
      }
    }

    return points;
  }, [locations, filter.zones]);

  return (
    <group>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={frameLines.length}
            array={new Float32Array(frameLines.flatMap((v) => [v.x, v.y, v.z]))}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#1e3a5f" transparent opacity={0.35} />
      </lineSegments>

      {visibleLocations.map((loc) => {
        const heat = heatMap.get(loc.id);
        if (!heat) return null;
        return (
          <LocationBox
            key={loc.id}
            id={loc.id}
            x={loc.x}
            y={loc.y}
            z={loc.z}
            color={heat.color}
            opacity={heat.opacity}
          />
        );
      })}
    </group>
  );
}
