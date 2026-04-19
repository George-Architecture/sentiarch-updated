// ============================================================
// MassingViewer — BuildingScene
//
// Three.js scene that renders the 3D building massing model.
// Uses @react-three/fiber and @react-three/drei for React
// integration with OrbitControls, hover, click, and floor
// visibility toggles.
// ============================================================

import { useRef, useState, useMemo, useCallback } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  Html,
  Line,
} from "@react-three/drei";
import * as THREE from "three";
import type {
  BuildingMassing,
  RoomVolume,
  FloorInfo,
  CorridorVolume,
} from "@/types/massing";

// ---- Types --------------------------------------------------------------

export type ColorMode = "category" | "quality" | "uniform";

export interface SceneConfig {
  /** Set of visible floor indices. */
  visibleFloors: Set<number>;
  /** Whether to show wireframe overlay. */
  wireframe: boolean;
  /** Color mode. */
  colorMode: ColorMode;
  /** Section cut Y position (metres). null = no cut. */
  sectionCutY: number | null;
  /** Opacity for rooms (0–1). */
  roomOpacity: number;
  /** Whether to show corridors. */
  showCorridors: boolean;
  /** Whether to show doors. */
  showDoors: boolean;
  /** Whether to show slabs. */
  showSlabs: boolean;
}

export const DEFAULT_SCENE_CONFIG: SceneConfig = {
  visibleFloors: new Set(),
  wireframe: false,
  colorMode: "category",
  sectionCutY: null,
  roomOpacity: 0.85,
  showCorridors: true,
  showDoors: true,
  showSlabs: true,
};

interface BuildingSceneProps {
  building: BuildingMassing;
  config: SceneConfig;
  onRoomClick?: (room: RoomVolume) => void;
  onRoomHover?: (room: RoomVolume | null) => void;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
}

// ---- Quality Color Scale ------------------------------------------------

function qualityColor(score: number): string {
  // Red (0) → Yellow (0.5) → Green (1)
  const r = score < 0.5 ? 255 : Math.round(255 * (1 - score) * 2);
  const g = score > 0.5 ? 255 : Math.round(255 * score * 2);
  return `rgb(${r},${g},60)`;
}

// ---- Room Mesh Component ------------------------------------------------

interface RoomMeshProps {
  room: RoomVolume;
  config: SceneConfig;
  qualityScore?: number;
  onClick?: (room: RoomVolume) => void;
  onHover?: (room: RoomVolume | null) => void;
}

function RoomMesh({ room, config, qualityScore, onClick, onHover }: RoomMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const { bbox } = room;
  const sizeX = bbox.max.x - bbox.min.x;
  const sizeY = bbox.max.y - bbox.min.y;
  const sizeZ = bbox.max.z - bbox.min.z;
  const centerX = (bbox.min.x + bbox.max.x) / 2;
  const centerY = (bbox.min.y + bbox.max.y) / 2;
  const centerZ = (bbox.min.z + bbox.max.z) / 2;

  // Section cut: hide if room is entirely above cut plane
  if (config.sectionCutY !== null && bbox.min.y >= config.sectionCutY) {
    return null;
  }

  // Clip room height if section cut intersects it
  let clippedSizeY = sizeY;
  let clippedCenterY = centerY;
  if (config.sectionCutY !== null && bbox.max.y > config.sectionCutY) {
    clippedSizeY = config.sectionCutY - bbox.min.y;
    clippedCenterY = bbox.min.y + clippedSizeY / 2;
  }

  const color = useMemo(() => {
    if (config.colorMode === "uniform") return "#B0BEC5";
    if (config.colorMode === "quality" && qualityScore !== undefined) {
      return qualityColor(qualityScore);
    }
    return room.colorHex;
  }, [config.colorMode, room.colorHex, qualityScore]);

  const handlePointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHovered(true);
      onHover?.(room);
      document.body.style.cursor = "pointer";
    },
    [room, onHover],
  );

  const handlePointerOut = useCallback(() => {
    setHovered(false);
    onHover?.(null);
    document.body.style.cursor = "default";
  }, [onHover]);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onClick?.(room);
    },
    [room, onClick],
  );

  return (
    <group>
      {/* Solid mesh */}
      <mesh
        ref={meshRef}
        position={[centerX, clippedCenterY, centerZ]}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <boxGeometry args={[sizeX, clippedSizeY, sizeZ]} />
        <meshStandardMaterial
          color={hovered ? "#FFD700" : color}
          transparent
          opacity={config.roomOpacity}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Wireframe overlay */}
      {config.wireframe && (
        <mesh position={[centerX, clippedCenterY, centerZ]}>
          <boxGeometry args={[sizeX, clippedSizeY, sizeZ]} />
          <meshBasicMaterial
            color="#000000"
            wireframe
            transparent
            opacity={0.3}
          />
        </mesh>
      )}

      {/* Room label (visible when hovered) */}
      {hovered && (
        <Html
          position={[centerX, clippedCenterY + clippedSizeY / 2 + 0.5, centerZ]}
          center
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              background: "rgba(0,0,0,0.8)",
              color: "#fff",
              padding: "4px 8px",
              borderRadius: 4,
              fontSize: 11,
              whiteSpace: "nowrap",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            {room.name} ({room.areaM2.toFixed(0)} m²)
          </div>
        </Html>
      )}
    </group>
  );
}

// ---- Corridor Mesh Component --------------------------------------------

interface CorridorMeshProps {
  corridor: CorridorVolume;
  config: SceneConfig;
}

function CorridorMesh({ corridor, config }: CorridorMeshProps) {
  const { bbox } = corridor;

  if (config.sectionCutY !== null && bbox.min.y >= config.sectionCutY) {
    return null;
  }

  const sizeX = bbox.max.x - bbox.min.x;
  let sizeY = bbox.max.y - bbox.min.y;
  const sizeZ = bbox.max.z - bbox.min.z;
  const centerX = (bbox.min.x + bbox.max.x) / 2;
  let centerY = (bbox.min.y + bbox.max.y) / 2;
  const centerZ = (bbox.min.z + bbox.max.z) / 2;

  if (config.sectionCutY !== null && bbox.max.y > config.sectionCutY) {
    sizeY = config.sectionCutY - bbox.min.y;
    centerY = bbox.min.y + sizeY / 2;
  }

  return (
    <mesh position={[centerX, centerY, centerZ]}>
      <boxGeometry args={[sizeX, sizeY, sizeZ]} />
      <meshStandardMaterial
        color="#E0E0E0"
        transparent
        opacity={0.4}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ---- Floor Slab Component -----------------------------------------------

interface SlabMeshProps {
  floor: FloorInfo;
  config: SceneConfig;
  buildingBBox: { minX: number; maxX: number; minZ: number; maxZ: number };
}

function SlabMesh({ floor, config, buildingBBox }: SlabMeshProps) {
  const slabY = floor.slab.bbox.min.y;

  if (config.sectionCutY !== null && slabY >= config.sectionCutY) {
    return null;
  }

  const sizeX = buildingBBox.maxX - buildingBBox.minX + 1;
  const sizeZ = buildingBBox.maxZ - buildingBBox.minZ + 1;
  const centerX = (buildingBBox.minX + buildingBBox.maxX) / 2;
  const centerZ = (buildingBBox.minZ + buildingBBox.maxZ) / 2;
  const centerY = (floor.slab.bbox.min.y + floor.slab.bbox.max.y) / 2;

  return (
    <mesh position={[centerX, centerY, centerZ]}>
      <boxGeometry args={[sizeX, floor.slab.thicknessM, sizeZ]} />
      <meshStandardMaterial
        color="#BDBDBD"
        transparent
        opacity={0.15}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ---- Section Cut Plane --------------------------------------------------

interface SectionPlaneProps {
  y: number;
  size: number;
  centerX: number;
  centerZ: number;
}

function SectionPlane({ y, size, centerX, centerZ }: SectionPlaneProps) {
  return (
    <mesh position={[centerX, y, centerZ]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[size * 1.2, size * 1.2]} />
      <meshBasicMaterial
        color="#FF5722"
        transparent
        opacity={0.15}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ---- Ground Grid --------------------------------------------------------

function GroundGrid({ size, centerX, centerZ }: { size: number; centerX: number; centerZ: number }) {
  const gridPoints = useMemo(() => {
    const lines: [number, number, number][][] = [];
    const half = size / 2;
    const step = 5; // 5m grid

    for (let i = -half; i <= half; i += step) {
      lines.push([
        [centerX + i, -0.01, centerZ - half],
        [centerX + i, -0.01, centerZ + half],
      ]);
      lines.push([
        [centerX - half, -0.01, centerZ + i],
        [centerX + half, -0.01, centerZ + i],
      ]);
    }
    return lines;
  }, [size, centerX, centerZ]);

  return (
    <group>
      {gridPoints.map((pts, i) => (
        <Line
          key={i}
          points={pts}
          color="#E0E0E0"
          lineWidth={0.5}
          transparent
          opacity={0.5}
        />
      ))}
    </group>
  );
}

// ---- Camera Setup -------------------------------------------------------

function CameraSetup({ building }: { building: BuildingMassing }) {
  const { camera } = useThree();

  useMemo(() => {
    const bb = building.boundingBox;
    const cx = (bb.min.x + bb.max.x) / 2;
    const cy = (bb.min.y + bb.max.y) / 2;
    const cz = (bb.min.z + bb.max.z) / 2;
    const maxDim = Math.max(
      bb.max.x - bb.min.x,
      bb.max.y - bb.min.y,
      bb.max.z - bb.min.z,
    );
    const dist = maxDim * 1.5;

    camera.position.set(cx + dist * 0.7, cy + dist * 0.5, cz + dist * 0.7);
    camera.lookAt(cx, cy, cz);
  }, [building, camera]);

  return null;
}

// ---- Main Scene Component -----------------------------------------------

function Scene({
  building,
  config,
  onRoomClick,
  onRoomHover,
}: Omit<BuildingSceneProps, "canvasRef">) {
  const buildingBBox = useMemo(() => {
    const bb = building.boundingBox;
    return {
      minX: bb.min.x,
      maxX: bb.max.x,
      minZ: bb.min.z,
      maxZ: bb.max.z,
    };
  }, [building]);

  const gridSize = useMemo(() => {
    const dx = building.boundingBox.max.x - building.boundingBox.min.x;
    const dz = building.boundingBox.max.z - building.boundingBox.min.z;
    return Math.max(dx, dz) + 20;
  }, [building]);

  const centerX = (building.boundingBox.min.x + building.boundingBox.max.x) / 2;
  const centerZ = (building.boundingBox.min.z + building.boundingBox.max.z) / 2;

  return (
    <>
      <CameraSetup building={building} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        target={[
          centerX,
          building.totalHeightM / 2,
          centerZ,
        ]}
      />

      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[50, 80, 50]} intensity={0.8} castShadow />
      <directionalLight position={[-30, 60, -30]} intensity={0.3} />
      <Environment preset="city" />

      {/* Ground grid */}
      <GroundGrid size={gridSize} centerX={centerX} centerZ={centerZ} />

      {/* Ground plane */}
      <mesh
        position={[centerX, -0.05, centerZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[gridSize * 1.5, gridSize * 1.5]} />
        <meshStandardMaterial color="#F5F5F0" />
      </mesh>

      {/* Building floors */}
      {building.floors.map((floor) => {
        if (!config.visibleFloors.has(floor.floorIndex)) return null;

        return (
          <group key={floor.floorIndex}>
            {/* Rooms */}
            {floor.rooms.map((room) => (
              <RoomMesh
                key={`${floor.floorIndex}-${room.spaceId}`}
                room={room}
                config={config}
                onClick={onRoomClick}
                onHover={onRoomHover}
              />
            ))}

            {/* Corridors */}
            {config.showCorridors &&
              floor.corridors.map((corr) => (
                <CorridorMesh
                  key={`corr-${floor.floorIndex}-${corr.id}`}
                  corridor={corr}
                  config={config}
                />
              ))}

            {/* Door markers */}
            {config.showDoors &&
              floor.doors.map((door, di) => {
                if (
                  config.sectionCutY !== null &&
                  door.position.y >= config.sectionCutY
                ) {
                  return null;
                }
                return (
                  <mesh
                    key={`door-${floor.floorIndex}-${di}`}
                    position={[
                      door.position.x,
                      door.position.y + door.heightM / 2,
                      door.position.z,
                    ]}
                  >
                    <boxGeometry
                      args={[door.widthM, door.heightM, 0.15]}
                    />
                    <meshStandardMaterial
                      color="#FF9800"
                      transparent
                      opacity={0.7}
                    />
                  </mesh>
                );
              })}

            {/* Floor slab */}
            {config.showSlabs && (
              <SlabMesh
                floor={floor}
                config={config}
                buildingBBox={buildingBBox}
              />
            )}
          </group>
        );
      })}

      {/* Section cut plane */}
      {config.sectionCutY !== null && (
        <SectionPlane
          y={config.sectionCutY}
          size={gridSize}
          centerX={centerX}
          centerZ={centerZ}
        />
      )}
    </>
  );
}

// ---- Exported Canvas Wrapper --------------------------------------------

export default function BuildingScene({
  building,
  config,
  onRoomClick,
  onRoomHover,
  canvasRef,
}: BuildingSceneProps) {
  return (
    <Canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%" }}
      camera={{ fov: 50, near: 0.1, far: 1000 }}
      gl={{ preserveDrawingBuffer: true }}
    >
      <Scene
        building={building}
        config={config}
        onRoomClick={onRoomClick}
        onRoomHover={onRoomHover}
      />
    </Canvas>
  );
}
