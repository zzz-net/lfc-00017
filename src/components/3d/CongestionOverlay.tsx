import { useMemo } from 'react';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
import { useWarehouseStore } from '@/store/warehouseStore';
import type { CongestionPlan, CongestionHotspot, RoutePoint, AffectedLocation } from '@/types/warehouse';

function HotspotMarker({ hotspot, color = '#ff6b35' }: { hotspot: CongestionHotspot; color?: string }) {
  const pulseScale = 1 + Math.sin(Date.now() * 0.003) * 0.1;
  const size = 0.8 + hotspot.severity / 100 * 1.2;

  return (
    <group position={[hotspot.centerX, hotspot.centerY + 0.5, hotspot.centerZ]}>
      <mesh position={[0, -0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[size * 0.3, size * 0.5, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -0.3, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={pulseScale}>
        <ringGeometry args={[size * 0.5, size * 0.6, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, size * 0.8, 0]}>
        <cylinderGeometry args={[0.05, 0.05, size * 1.2, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} />
      </mesh>
      <mesh position={[0, size * 1.4, 0]}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Text
        position={[0, size * 1.8, 0]}
        fontSize={0.25}
        color={color}
        anchorX="center"
        anchorY="middle"
      >
        {Math.round(hotspot.severity)}%
      </Text>
    </group>
  );
}

function RouteLine({ points, color = '#00d4ff', opacity = 0.8 }: { points: RoutePoint[]; color?: string; opacity?: number }) {
  const linePoints = useMemo(() => {
    return points.map((p) => new THREE.Vector3(p.x, p.y + 0.5, p.z));
  }, [points]);

  if (linePoints.length < 2) return null;

  return (
    <line>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={linePoints.length}
          array={new Float32Array(linePoints.flatMap((v) => [v.x, v.y, v.z]))}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial color={color} transparent opacity={opacity} linewidth={2} />
    </line>
  );
}

function RoutePointMarker({ point, color = '#00d4ff' }: { point: RoutePoint; color?: string }) {
  const colors: Record<RoutePoint['type'], string> = {
    pickup: '#22c55e',
    dropoff: '#3b82f6',
    waypoint: '#6b7280',
    congestion: '#ff6b35',
  };
  const pointColor = colors[point.type] || color;

  return (
    <group position={[point.x, point.y + 0.5, point.z]}>
      <mesh>
        <sphereGeometry args={[0.15, 12, 12]} />
        <meshBasicMaterial color={pointColor} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.25, 12, 12]} />
        <meshBasicMaterial color={pointColor} transparent opacity={0.3} />
      </mesh>
      {point.waitTime !== undefined && point.waitTime > 0 && (
        <Text
          position={[0, 0.5, 0]}
          fontSize={0.18}
          color="#fbbf24"
          anchorX="center"
          anchorY="middle"
        >
          {point.waitTime.toFixed(1)}min
        </Text>
      )}
    </group>
  );
}

function AffectedLocationMarker({
  location,
  locX,
  locY,
  locZ,
  isCompare = false,
}: {
  location: AffectedLocation;
  locX: number;
  locY: number;
  locZ: number;
  isCompare?: boolean;
}) {
  const improvement = location.improvement;
  const color = improvement > 30 ? '#22c55e' : improvement > 10 ? '#eab308' : '#ef4444';
  const baseColor = isCompare ? '#a855f7' : color;

  return (
    <group position={[locX + 1.5, locY + 1.5, locZ + 1.5]}>
      <mesh>
        <boxGeometry args={[2.8, 2.8, 2.8]} />
        <meshBasicMaterial color={baseColor} transparent opacity={0.15} wireframe={isCompare} />
      </mesh>
      <mesh position={[0, 1.8, 0]}>
        <boxGeometry args={[2.5, 0.15, 0.1]} />
        <meshBasicMaterial color={baseColor} />
      </mesh>
      <Text
        position={[0, 2.2, 0]}
        fontSize={0.2}
        color={baseColor}
        anchorX="center"
        anchorY="middle"
      >
        {improvement > 0 ? '+' : ''}{improvement.toFixed(0)}%
      </Text>
      {location.locked && (
        <Text
          position={[1.2, 1.2, 1.2]}
          fontSize={0.25}
          color="#f59e0b"
          anchorX="center"
          anchorY="middle"
        >
          🔒
        </Text>
      )}
    </group>
  );
}

export default function CongestionOverlay() {
  const congestion = useWarehouseStore((s) => s.congestion);
  const locations = useWarehouseStore((s) => s.locations);
  const detectCongestionHotspots = useWarehouseStore((s) => s.detectCongestionHotspots);

  const activePlan = congestion.plans.find((p) => p.id === congestion.activePlanId);
  const comparePlan = congestion.plans.find((p) => p.id === congestion.comparePlanId);

  const currentHotspots = useMemo(() => {
    if (activePlan) return activePlan.hotspots;
    return detectCongestionHotspots();
  }, [activePlan, detectCongestionHotspots]);

  const locationMap = useMemo(() => {
    const map = new Map<string, { x: number; y: number; z: number }>();
    for (const loc of locations) {
      map.set(loc.id, { x: loc.x, y: loc.y, z: loc.z });
    }
    return map;
  }, [locations]);

  if (!congestion.activePlanId && currentHotspots.length === 0) {
    return null;
  }

  return (
    <group>
      {currentHotspots.map((hotspot) => (
        <HotspotMarker key={`hotspot-${hotspot.id}`} hotspot={hotspot} />
      ))}

      {activePlan && (
        <>
          <RouteLine points={activePlan.route} color="#00d4ff" opacity={0.9} />
          {activePlan.route.map((point) => (
            <RoutePointMarker key={`active-point-${point.id}`} point={point} />
          ))}
          {activePlan.affectedLocations
            .filter((loc) => locationMap.has(loc.locationId))
            .map((loc) => {
              const pos = locationMap.get(loc.locationId)!;
              return (
                <AffectedLocationMarker
                  key={`active-loc-${loc.locationId}`}
                  location={loc}
                  locX={pos.x}
                  locY={pos.y}
                  locZ={pos.z}
                />
              );
            })}
        </>
      )}

      {congestion.showComparison && comparePlan && (
        <>
          <RouteLine points={comparePlan.route} color="#a855f7" opacity={0.6} />
          {comparePlan.route.map((point) => (
            <RoutePointMarker key={`compare-point-${point.id}`} point={point} color="#a855f7" />
          ))}
          {comparePlan.affectedLocations
            .filter((loc) => locationMap.has(loc.locationId))
            .map((loc) => {
              const pos = locationMap.get(loc.locationId)!;
              return (
                <AffectedLocationMarker
                  key={`compare-loc-${loc.locationId}`}
                  location={loc}
                  locX={pos.x}
                  locY={pos.y}
                  locZ={pos.z}
                  isCompare
                />
              );
            })}
        </>
      )}
    </group>
  );
}
