import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import {
  Grid,
  Html,
  Line,
  OrbitControls,
  QuadraticBezierLine,
  RoundedBox,
} from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  AgentConfig,
  DepartmentInfo,
  HandoverStep,
} from '../types/trading';
import { STEP_DURATION_MS } from '../data/agentsData';

interface VirtualTradingFloorProps {
  agents: AgentConfig[];
  departments: DepartmentInfo[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  activeHandover: HandoverStep;
  isSimulating: boolean;
  showMT5Screens: boolean;
  followSelected: boolean;
  autoRotate: boolean;
  resetCameraTrigger: number;
  liveGoldPrice: number;
  customCommandOverride?: {
    agentId: string;
    taskText: string;
    bubbleText: string;
  } | null;
}

/**
 * Đồng hồ bước mô phỏng dùng chung trong Canvas: ghi lại thời điểm (theo clock R3F)
 * mà bước Handover hiện tại bắt đầu, để nhân vật đi/đứng/quay về KHỚP đúng nhịp
 * đổi bước của App (không còn tự chạy theo clock % 4.5 gây "nhảy" vị trí).
 */
export interface StepClock {
  key: string;
  start: number;
}

function getStepElapsed(clock: StepClock, key: string, t: number): number {
  if (clock.key !== key) {
    clock.key = key;
    clock.start = t;
  }
  return t - clock.start;
}

const STEP_DURATION_SEC = STEP_DURATION_MS / 1000;

/** Phát hiện màn hình điện thoại để giảm tải WebGL/DOM overlay. */
function useIsMobile(): boolean {
  const query = '(max-width: 767px), (pointer: coarse)';
  const [isMobile, setIsMobile] = useState<boolean>(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

// Compute real-time world position of an agent (either at their desk or walking to target desk)
function getAgentCurrentWorldPos(
  agent: AgentConfig,
  allAgents: AgentConfig[],
  activeHandover: HandoverStep,
  isSimulating: boolean,
  stepElapsedSec: number
): {
  position: THREE.Vector3;
  rotationY: number;
  isWalking: boolean;
  isStandingGuest: boolean;
} {
  const homeChairPos = new THREE.Vector3(
    agent.deskPosition[0],
    0,
    agent.deskPosition[2] + 0.95
  ).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0);

  // Compute offset in local desk rotation
  const chairOffset = new THREE.Vector3(0, 0, 0.95).applyAxisAngle(
    new THREE.Vector3(0, 1, 0),
    agent.deskRotationY
  );
  homeChairPos.set(
    agent.deskPosition[0] + chairOffset.x,
    0,
    agent.deskPosition[2] + chairOffset.z
  );

  if (!isSimulating || activeHandover.fromAgentId !== agent.id) {
    return {
      position: homeChairPos,
      rotationY: agent.deskRotationY + Math.PI, // Facing monitors (-Z in local desk space)
      isWalking: false,
      isStandingGuest: false,
    };
  }

  const targetAgent = allAgents.find((a) => a.id === activeHandover.toAgentId);
  if (!targetAgent) {
    return {
      position: homeChairPos,
      rotationY: agent.deskRotationY + Math.PI,
      isWalking: false,
      isStandingGuest: false,
    };
  }

  // Stand right beside the target agent's desk
  const guestOffset = new THREE.Vector3(1.55, 0, 0.85).applyAxisAngle(
    new THREE.Vector3(0, 1, 0),
    targetAgent.deskRotationY
  );
  const targetStandPos = new THREE.Vector3(
    targetAgent.deskPosition[0] + guestOffset.x,
    0,
    targetAgent.deskPosition[2] + guestOffset.z
  );

  // Smooth ping-pong cycle inside each 4.5s step:
  // 0.0 -> 0.25: walk to target desk
  // 0.25 -> 0.82: stand beside target desk discussing Pip/Lot handover
  // 0.82 -> 1.0: walk back
  const phase = THREE.MathUtils.clamp(stepElapsedSec / STEP_DURATION_SEC, 0, 1);

  let t = 0;
  let walking = false;
  if (phase >= 1) {
    t = 0;
    walking = false;
  } else if (phase < 0.24) {
    t = THREE.MathUtils.smoothstep(phase / 0.24, 0, 1);
    walking = true;
  } else if (phase < 0.82) {
    t = 1;
    walking = false;
  } else {
    t = 1 - THREE.MathUtils.smoothstep((phase - 0.82) / 0.18, 0, 1);
    walking = true;
  }

  const currentPos = new THREE.Vector3().lerpVectors(
    homeChairPos,
    targetStandPos,
    t
  );

  let rotY = agent.deskRotationY + Math.PI;
  if (walking) {
    const dir =
      phase < 0.24
        ? new THREE.Vector3().subVectors(targetStandPos, homeChairPos)
        : new THREE.Vector3().subVectors(homeChairPos, targetStandPos);
    if (dir.lengthSq() > 0.001) {
      rotY = Math.atan2(dir.x, dir.z);
    }
  } else {
    // Face the target agent at their desk
    const toTarget = new THREE.Vector3().subVectors(
      new THREE.Vector3(
        targetAgent.deskPosition[0],
        0,
        targetAgent.deskPosition[2] + 0.5
      ),
      currentPos
    );
    rotY = Math.atan2(toTarget.x, toTarget.z);
  }

  return {
    position: currentPos,
    rotationY: rotY,
    isWalking: walking,
    isStandingGuest: !walking && t > 0.9,
  };
}

// 1. Department Glowing Floor Zone Component
const DepartmentZone3D: React.FC<{ dept: DepartmentInfo }> = ({ dept }) => {
  const [cx, , cz] = dept.centerPosition;
  const [w, d] = dept.zoneSize;
  const hw = w / 2;
  const hd = d / 2;

  const borderPoints = useMemo(
    () => [
      new THREE.Vector3(cx - hw, 0.03, cz - hd),
      new THREE.Vector3(cx + hw, 0.03, cz - hd),
      new THREE.Vector3(cx + hw, 0.03, cz + hd),
      new THREE.Vector3(cx - hw, 0.03, cz + hd),
      new THREE.Vector3(cx - hw, 0.03, cz - hd),
    ],
    [cx, cz, hw, hd]
  );

  const innerBorderPoints = useMemo(
    () => [
      new THREE.Vector3(cx - hw + 0.18, 0.035, cz - hd + 0.18),
      new THREE.Vector3(cx + hw - 0.18, 0.035, cz - hd + 0.18),
      new THREE.Vector3(cx + hw - 0.18, 0.035, cz + hd - 0.18),
      new THREE.Vector3(cx - hw + 0.18, 0.035, cz + hd - 0.18),
      new THREE.Vector3(cx - hw + 0.18, 0.035, cz - hd + 0.18),
    ],
    [cx, cz, hw, hd]
  );

  const corners: [number, number, number][] = [
    [cx - hw, 0.08, cz - hd],
    [cx + hw, 0.08, cz - hd],
    [cx + hw, 0.08, cz + hd],
    [cx - hw, 0.08, cz + hd],
  ];

  return (
    <group>
      {/* Translucent glowing zone floor pad */}
      <mesh
        position={[cx, 0.015, cz]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial
          color={dept.colorHex}
          emissive={dept.colorHex}
          emissiveIntensity={0.18}
          transparent
          opacity={0.11}
          roughness={0.4}
          metalness={0.6}
        />
      </mesh>

      {/* Outer glowing border line */}
      <Line
        points={borderPoints}
        color={dept.colorHex}
        lineWidth={3.2}
        transparent
        opacity={0.95}
      />

      {/* Inner accent border line */}
      <Line
        points={innerBorderPoints}
        color={dept.colorHex}
        lineWidth={1.2}
        transparent
        opacity={0.45}
      />

      {/* Glowing 3D border strips on the floor for extra WebGL depth */}
      <mesh position={[cx, 0.025, cz + hd]}>
        <boxGeometry args={[w, 0.04, 0.08]} />
        <meshStandardMaterial
          color={dept.colorHex}
          emissive={dept.colorHex}
          emissiveIntensity={1.6}
        />
      </mesh>
      <mesh position={[cx, 0.025, cz - hd]}>
        <boxGeometry args={[w, 0.04, 0.08]} />
        <meshStandardMaterial
          color={dept.colorHex}
          emissive={dept.colorHex}
          emissiveIntensity={1.6}
        />
      </mesh>
      <mesh position={[cx - hw, 0.025, cz]}>
        <boxGeometry args={[0.08, 0.04, d]} />
        <meshStandardMaterial
          color={dept.colorHex}
          emissive={dept.colorHex}
          emissiveIntensity={1.6}
        />
      </mesh>
      <mesh position={[cx + hw, 0.025, cz]}>
        <boxGeometry args={[0.08, 0.04, d]} />
        <meshStandardMaterial
          color={dept.colorHex}
          emissive={dept.colorHex}
          emissiveIntensity={1.6}
        />
      </mesh>

      {/* Corner Pylons */}
      {corners.map((pos, idx) => (
        <mesh key={idx} position={pos}>
          <boxGeometry args={[0.24, 0.16, 0.24]} />
          <meshStandardMaterial
            color={dept.colorHex}
            emissive={dept.colorHex}
            emissiveIntensity={2.2}
          />
        </mesh>
      ))}

      {/* Zone Title Floor Plaque (Html transform flat on floor front edge) */}
      <Html
        transform
        position={[cx, 0.06, cz + hd - 0.55]}
        rotation={[-Math.PI / 2, 0, 0]}
        distanceFactor={12}
        zIndexRange={[10, 0]}
      >
        <div
          style={{
            borderColor: dept.colorHex,
            boxShadow: `0 0 22px ${dept.colorHex}44`,
          }}
          className="px-4 py-1.5 rounded-md bg-slate-950/95 border-2 backdrop-blur-md select-none pointer-events-none whitespace-nowrap flex items-center gap-2.5"
        >
          <span
            style={{ backgroundColor: dept.colorHex }}
            className="w-2.5 h-2.5 rounded-full animate-pulse"
          />
          <span
            style={{ color: dept.colorHex }}
            className="font-mono font-extrabold text-xs tracking-widest uppercase"
          >
            {dept.zoneLabel3D}
          </span>
          <span className="text-[10px] font-mono text-slate-400 border-l border-slate-700 pl-2">
            {dept.englishName}
          </span>
        </div>
      </Html>
    </group>
  );
};

// 2. Workstation Desk + Dual Monitors + Direct MT5 Screen Overlay
const WorkstationDesk3D: React.FC<{
  agent: AgentConfig;
  dept: DepartmentInfo;
  isSelected: boolean;
  isInvolvedInHandover: boolean;
  showMT5Screens: boolean;
  liveGoldPrice: number;
  onSelect: () => void;
}> = ({
  agent,
  dept,
  isSelected,
  isInvolvedInHandover,
  showMT5Screens,
  liveGoldPrice,
  onSelect,
}) => {
  const glowColor = isInvolvedInHandover
    ? '#fbbf24'
    : isSelected
    ? '#34d399'
    : dept.colorHex;

  return (
    <group
      position={agent.deskPosition}
      rotation={[0, agent.deskRotationY, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {/* Selection / Active Floor Ring under Desk */}
      {(isSelected || isInvolvedInHandover) && (
        <mesh position={[0, 0.03, 0.35]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.45, 1.65, 48]} />
          <meshBasicMaterial
            color={isInvolvedInHandover ? '#fbbf24' : '#34d399'}
            side={THREE.DoubleSide}
            transparent
            opacity={0.85}
          />
        </mesh>
      )}

      {/* Desk Tabletop */}
      <RoundedBox
        args={[2.3, 0.09, 1.15]}
        radius={0.03}
        smoothness={4}
        position={[0, 0.76, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color="#0f172a"
          roughness={0.25}
          metalness={0.75}
        />
      </RoundedBox>

      {/* Glowing LED Front Strip on Desk */}
      <mesh position={[0, 0.76, 0.58]}>
        <boxGeometry args={[2.26, 0.035, 0.025]} />
        <meshStandardMaterial
          color={glowColor}
          emissive={glowColor}
          emissiveIntensity={2.0}
        />
      </mesh>

      {/* Left & Right Metallic Desk Legs */}
      <mesh position={[-0.98, 0.38, 0]} castShadow>
        <boxGeometry args={[0.09, 0.76, 0.95]} />
        <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0.98, 0.38, 0]} castShadow>
        <boxGeometry args={[0.09, 0.76, 0.95]} />
        <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.3} />
      </mesh>

      {/* Dual Monitor Stand Base & Arm */}
      <mesh position={[0, 0.82, -0.32]}>
        <cylinderGeometry args={[0.16, 0.2, 0.04, 20]} />
        <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0, 1.05, -0.34]}>
        <cylinderGeometry args={[0.035, 0.035, 0.45, 16]} />
        <meshStandardMaterial color="#475569" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* LEFT MONITOR (Curved / Angled Dual-Monitor 1) */}
      <group position={[-0.56, 1.24, -0.26]} rotation={[0, 0.16, 0]}>
        <RoundedBox args={[1.04, 0.62, 0.04]} radius={0.015}>
          <meshStandardMaterial
            color="#090d16"
            metalness={0.7}
            roughness={0.2}
          />
        </RoundedBox>
        {/* Glowing Screen Surface */}
        <mesh position={[0, 0, 0.023]}>
          <planeGeometry args={[0.98, 0.56]} />
          <meshStandardMaterial
            color="#020617"
            emissive={glowColor}
            emissiveIntensity={0.35}
          />
        </mesh>
        {/* Mini simulated chart bars on 3D monitor surface */}
        {[-0.32, -0.18, -0.04, 0.1, 0.24, 0.36].map((bx, i) => (
          <mesh
            key={i}
            position={[bx, (i % 2 === 0 ? 0.05 : -0.04), 0.028]}
          >
            <planeGeometry args={[0.06, 0.18 + (i % 3) * 0.08]} />
            <meshBasicMaterial
              color={i % 2 === 0 ? '#10b981' : '#f43f5e'}
            />
          </mesh>
        ))}
      </group>

      {/* RIGHT MONITOR (Curved / Angled Dual-Monitor 2) */}
      <group position={[0.56, 1.24, -0.26]} rotation={[0, -0.16, 0]}>
        <RoundedBox args={[1.04, 0.62, 0.04]} radius={0.015}>
          <meshStandardMaterial
            color="#090d16"
            metalness={0.7}
            roughness={0.2}
          />
        </RoundedBox>
        <mesh position={[0, 0, 0.023]}>
          <planeGeometry args={[0.98, 0.56]} />
          <meshStandardMaterial
            color="#020617"
            emissive="#fbbf24"
            emissiveIntensity={0.28}
          />
        </mesh>
        {[-0.3, -0.1, 0.1, 0.3].map((bx, i) => (
          <mesh key={i} position={[bx, 0.02, 0.028]}>
            <planeGeometry args={[0.12, 0.24]} />
            <meshBasicMaterial
              color={i === 3 ? '#fbbf24' : '#38bdf8'}
              transparent
              opacity={0.75}
            />
          </mesh>
        ))}
      </group>

      {/* Direct MT5 Screen Overlay (<Html transform>) mounted across the Dual Monitors */}
      {showMT5Screens && (
        <Html
          transform
          position={[0, 1.25, -0.19]}
          distanceFactor={4.8}
          zIndexRange={[20, 0]}
        >
          <div
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            style={{
              borderColor: glowColor,
              boxShadow: `0 0 18px ${glowColor}55`,
            }}
            className="w-[330px] rounded-lg bg-slate-950/95 border-2 p-2.5 text-left font-mono select-none cursor-pointer backdrop-blur-md mt5-scanline relative overflow-hidden"
          >
            {/* Top MT5 terminal bar */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-1 mb-1.5">
              <div className="flex items-center gap-1.5">
                <span
                  style={{ backgroundColor: glowColor }}
                  className="w-2 h-2 rounded-full animate-ping"
                />
                <span className="text-[10px] font-bold text-amber-400 tracking-wider uppercase truncate max-w-[210px]">
                  {agent.mt5ScreenTitle}
                </span>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 text-emerald-400 border border-emerald-500/30 font-semibold">
                XAU {liveGoldPrice.toFixed(2)}
              </span>
            </div>

            {/* Primary Specialty MT5 Screen Line required by specification */}
            <div className="bg-slate-900/90 border border-slate-800 rounded px-2 py-1.5 mb-1.5">
              <div className="text-[11px] font-bold text-slate-100 leading-snug">
                {agent.mt5ScreenText}
              </div>
            </div>

            {/* 3 Sub-metrics row */}
            <div className="grid grid-cols-3 gap-1">
              {agent.mt5SubMetrics.map((m, i) => (
                <div
                  key={i}
                  className="bg-slate-900/60 rounded px-1.5 py-1 border border-slate-800/80"
                >
                  <div className="text-[8px] text-slate-400 truncate">
                    {m.label}
                  </div>
                  <div
                    className={`text-[9px] font-bold truncate ${
                      m.trend === 'up'
                        ? 'text-emerald-400'
                        : m.trend === 'down'
                        ? 'text-amber-400'
                        : 'text-sky-300'
                    }`}
                  >
                    {m.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Html>
      )}

      {/* Mechanical RGB Keyboard on Desk */}
      <RoundedBox
        args={[0.58, 0.025, 0.22]}
        radius={0.008}
        position={[-0.05, 0.82, 0.24]}
      >
        <meshStandardMaterial
          color="#1e293b"
          emissive={glowColor}
          emissiveIntensity={0.45}
        />
      </RoundedBox>

      {/* Mouse & Mousepad */}
      <mesh position={[0.42, 0.81, 0.24]}>
        <boxGeometry args={[0.26, 0.008, 0.24]} />
        <meshStandardMaterial color="#090d16" />
      </mesh>
      <RoundedBox
        args={[0.08, 0.025, 0.12]}
        radius={0.02}
        position={[0.42, 0.822, 0.24]}
      >
        <meshStandardMaterial color="#334155" />
      </RoundedBox>

      {/* Desk Status Beacon Pillar */}
      <mesh position={[-0.92, 0.92, -0.35]}>
        <cylinderGeometry args={[0.04, 0.05, 0.24, 16]} />
        <meshStandardMaterial
          color={glowColor}
          emissive={glowColor}
          emissiveIntensity={isInvolvedInHandover ? 3.0 : 1.2}
        />
      </mesh>

      {/* Ergonomic Executive Chair at Desk */}
      <group position={[0, 0, 0.95]}>
        {/* Chair Base & Wheels */}
        <mesh position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.42, 12]} />
          <meshStandardMaterial color="#334155" metalness={0.8} />
        </mesh>
        <mesh position={[0, 0.04, 0]}>
          <cylinderGeometry args={[0.32, 0.32, 0.04, 6]} />
          <meshStandardMaterial color="#1e293b" metalness={0.8} />
        </mesh>
        {/* Seat Cushion */}
        <RoundedBox
          args={[0.56, 0.08, 0.54]}
          radius={0.03}
          position={[0, 0.45, 0]}
        >
          <meshStandardMaterial color="#0f172a" roughness={0.5} />
        </RoundedBox>
        {/* Chair Backrest */}
        <RoundedBox
          args={[0.52, 0.72, 0.08]}
          radius={0.03}
          position={[0, 0.84, 0.24]}
        >
          <meshStandardMaterial color="#0f172a" roughness={0.4} />
        </RoundedBox>
        {/* Chair Accent Stripe */}
        <mesh position={[0, 0.86, 0.285]}>
          <boxGeometry args={[0.32, 0.5, 0.015]} />
          <meshStandardMaterial
            color={dept.colorHex}
            emissive={dept.colorHex}
            emissiveIntensity={0.8}
          />
        </mesh>
      </group>
    </group>
  );
};

// 3. Animated 3D Agent Character (Sitting Typing OR Walking Handover + Overhead Badge & Chat Bubble)
const AgentCharacter3D: React.FC<{
  agent: AgentConfig;
  dept: DepartmentInfo;
  allAgents: AgentConfig[];
  activeHandover: HandoverStep;
  isSimulating: boolean;
  isSelected: boolean;
  onSelect: () => void;
  stepClock: StepClock;
  stepKey: string;
  compactLabel: boolean;
  customCommandOverride?: {
    agentId: string;
    taskText: string;
    bubbleText: string;
  } | null;
}> = ({
  agent,
  dept,
  allAgents,
  activeHandover,
  isSimulating,
  isSelected,
  onSelect,
  stepClock,
  stepKey,
  compactLabel,
  customCommandOverride,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);

  const isFromAgent = isSimulating && activeHandover.fromAgentId === agent.id;
  const isToAgent = isSimulating && activeHandover.toAgentId === agent.id;
  const isCollaborating = isFromAgent || isToAgent;
  const hasCustomOverride = customCommandOverride?.agentId === agent.id;

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (!groupRef.current) return;

    const { position, rotationY, isWalking, isStandingGuest } =
      getAgentCurrentWorldPos(
        agent,
        allAgents,
        activeHandover,
        isSimulating,
        getStepElapsed(stepClock, stepKey, t)
      );

    groupRef.current.position.copy(position);

    // Smoothly interpolate character rotation
    const currentRot = groupRef.current.rotation.y;
    const diff = Math.atan2(
      Math.sin(rotationY - currentRot),
      Math.cos(rotationY - currentRot)
    );
    groupRef.current.rotation.y = currentRot + diff * 0.18;

    if (isWalking) {
      // Walking animation: legs & arms swing rhythmically, slight vertical bounce
      const walkSpeed = 14;
      groupRef.current.position.y = Math.abs(Math.sin(t * walkSpeed)) * 0.06;
      if (leftLegRef.current && rightLegRef.current) {
        leftLegRef.current.rotation.x = Math.sin(t * walkSpeed) * 0.55;
        rightLegRef.current.rotation.x = -Math.sin(t * walkSpeed) * 0.55;
      }
      if (leftArmRef.current && rightArmRef.current) {
        leftArmRef.current.rotation.x = -Math.sin(t * walkSpeed) * 0.45;
        rightArmRef.current.rotation.x = Math.sin(t * walkSpeed) * 0.45;
      }
      if (headRef.current) {
        headRef.current.rotation.y = Math.sin(t * 3) * 0.1;
      }
    } else if (isStandingGuest) {
      // Standing beside colleague's desk presenting Pip/Lot metrics
      groupRef.current.position.y = 0;
      if (leftLegRef.current && rightLegRef.current) {
        leftLegRef.current.rotation.x = 0;
        rightLegRef.current.rotation.x = 0;
      }
      if (leftArmRef.current && rightArmRef.current) {
        leftArmRef.current.rotation.x = -0.6 + Math.sin(t * 7) * 0.22;
        rightArmRef.current.rotation.x = -0.75 - Math.sin(t * 7) * 0.22;
      }
      if (headRef.current) {
        headRef.current.rotation.y = Math.sin(t * 4) * 0.15;
      }
    } else {
      // Sitting at desk typing rapidly on keyboard & scanning dual monitors
      groupRef.current.position.y = -0.12;
      if (leftLegRef.current && rightLegRef.current) {
        leftLegRef.current.rotation.x = -Math.PI / 2.4;
        rightLegRef.current.rotation.x = -Math.PI / 2.4;
      }
      const typingSpeed = 16 + (agent.defaultProgress % 5);
      if (leftArmRef.current && rightArmRef.current) {
        leftArmRef.current.rotation.x =
          -1.05 + Math.sin(t * typingSpeed) * 0.16;
        rightArmRef.current.rotation.x =
          -1.05 + Math.cos(t * typingSpeed) * 0.16;
      }
      if (headRef.current) {
        headRef.current.rotation.y =
          Math.sin(t * 1.8 + agent.deskPosition[0]) * 0.22;
      }
    }
  });

  const activeTaskText = hasCustomOverride
    ? customCommandOverride.taskText
    : isFromAgent
    ? activeHandover.fromTaskLabel
    : isToAgent
    ? activeHandover.toTaskLabel
    : agent.defaultTask;

  const activeBubbleText = hasCustomOverride
    ? customCommandOverride.bubbleText
    : isFromAgent
    ? activeHandover.chatBubbleFrom
    : isToAgent
    ? activeHandover.chatBubbleTo
    : null;

  return (
    <group
      ref={groupRef}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {/* Torso / Suit Jacket */}
      <RoundedBox
        args={[0.42, 0.52, 0.24]}
        radius={0.05}
        position={[0, 0.86, 0]}
        castShadow
      >
        <meshStandardMaterial
          color={agent.suitColor}
          roughness={0.4}
          metalness={0.3}
        />
      </RoundedBox>

      {/* Glowing Tie / Lapel Collar on Suit */}
      <mesh position={[0, 0.88, 0.125]}>
        <boxGeometry args={[0.07, 0.34, 0.02]} />
        <meshStandardMaterial
          color={agent.avatarColor}
          emissive={agent.avatarColor}
          emissiveIntensity={1.1}
        />
      </mesh>

      {/* Head Group */}
      <group ref={headRef} position={[0, 1.32, 0]}>
        <RoundedBox args={[0.3, 0.3, 0.3]} radius={0.08} castShadow>
          <meshStandardMaterial color="#f1c27d" roughness={0.5} />
        </RoundedBox>
        {/* Hair */}
        <RoundedBox
          args={[0.32, 0.12, 0.32]}
          radius={0.04}
          position={[0, 0.13, -0.01]}
        >
          <meshStandardMaterial color={agent.hairColor} roughness={0.6} />
        </RoundedBox>
        {/* Cyber / Trading AR Glasses Visor */}
        <mesh position={[0, 0.02, 0.155]}>
          <boxGeometry args={[0.24, 0.065, 0.02]} />
          <meshStandardMaterial
            color={dept.colorHex}
            emissive={dept.colorHex}
            emissiveIntensity={1.8}
          />
        </mesh>
      </group>

      {/* Left Arm & Hand (pivots from shoulder) */}
      <group ref={leftArmRef} position={[-0.27, 1.05, 0]}>
        <RoundedBox
          args={[0.11, 0.42, 0.11]}
          radius={0.03}
          position={[0, -0.18, 0]}
        >
          <meshStandardMaterial color={agent.suitColor} />
        </RoundedBox>
        <mesh position={[0, -0.4, 0]}>
          <sphereGeometry args={[0.055, 12, 12]} />
          <meshStandardMaterial color="#f1c27d" />
        </mesh>
      </group>

      {/* Right Arm & Hand (pivots from shoulder) */}
      <group ref={rightArmRef} position={[0.27, 1.05, 0]}>
        <RoundedBox
          args={[0.11, 0.42, 0.11]}
          radius={0.03}
          position={[0, -0.18, 0]}
        >
          <meshStandardMaterial color={agent.suitColor} />
        </RoundedBox>
        <mesh position={[0, -0.4, 0]}>
          <sphereGeometry args={[0.055, 12, 12]} />
          <meshStandardMaterial color="#f1c27d" />
        </mesh>
      </group>

      {/* Left Leg */}
      <group ref={leftLegRef} position={[-0.11, 0.58, 0]}>
        <RoundedBox
          args={[0.13, 0.48, 0.13]}
          radius={0.03}
          position={[0, -0.22, 0]}
        >
          <meshStandardMaterial color="#0f172a" />
        </RoundedBox>
      </group>

      {/* Right Leg */}
      <group ref={rightLegRef} position={[0.11, 0.58, 0]}>
        <RoundedBox
          args={[0.13, 0.48, 0.13]}
          radius={0.03}
          position={[0, -0.22, 0]}
        >
          <meshStandardMaterial color="#0f172a" />
        </RoundedBox>
      </group>

      {/* Floating Overhead <Html> Status Card + Progress Bar + Handover Chat Bubble */}
      <Html
        position={[0, 1.88, 0]}
        center
        distanceFactor={15}
        zIndexRange={[40, 0]}
      >
        <div
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          className="flex flex-col items-center select-none cursor-pointer group"
        >
          {/* Active Handover Chat Bubble (Pip/Lot Exchange) */}
          {activeBubbleText && (
            <div className="mb-1.5 px-3 py-1.5 rounded-xl bg-amber-400 text-slate-950 font-sans font-bold text-[11px] shadow-[0_0_25px_rgba(251,191,36,0.75)] border-2 border-amber-200 max-w-[235px] text-center animate-bounce relative">
              <div className="flex items-center justify-center gap-1.5 mb-0.5">
                <span className="px-1.5 py-0.2 bg-slate-950 text-amber-300 rounded text-[9px] font-mono">
                  {activeHandover.pipTag}
                </span>
                <span className="px-1.5 py-0.2 bg-emerald-950 text-emerald-300 rounded text-[9px] font-mono">
                  {activeHandover.lotTag}
                </span>
              </div>
              <div>“{activeBubbleText}”</div>
            </div>
          )}

          {/* Overhead Agent Tag + Current Task + Progress Bar % */}
          {compactLabel && !isCollaborating && !isSelected && !activeBubbleText ? (
            // Điện thoại: Agent không hoạt động chỉ hiện chip tên gọn để giảm tải DOM
            <div className="px-2 py-0.5 rounded-full bg-slate-950/85 border border-slate-700 flex items-center gap-1.5">
              <span
                style={{ backgroundColor: dept.colorHex }}
                className="w-1.5 h-1.5 rounded-full"
              />
              <span className="text-[10px] font-bold text-slate-200 whitespace-nowrap">
                {agent.name}
              </span>
            </div>
          ) : (
          <div
            style={{
              borderColor: isCollaborating
                ? '#fbbf24'
                : isSelected
                ? '#34d399'
                : `${dept.colorHex}88`,
            }}
            className={`w-[195px] rounded-lg bg-slate-950/90 backdrop-blur-md border px-2.5 py-1.5 shadow-xl transition-transform ${
              isCollaborating || isSelected ? 'scale-105' : 'opacity-95'
            }`}
          >
            <div className="flex items-center justify-between gap-1 mb-0.5">
              <div className="flex items-center gap-1.5 truncate">
                <span
                  style={{ backgroundColor: dept.colorHex }}
                  className="w-2 h-2 rounded-full shrink-0"
                />
                <span className="text-[11px] font-bold text-white truncate">
                  {agent.name}
                </span>
              </div>
              <span
                className={`text-[9px] font-mono px-1 py-0.2 rounded font-semibold shrink-0 ${
                  isCollaborating
                    ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {isCollaborating ? 'HANDOVER' : `${agent.defaultProgress}%`}
              </span>
            </div>

            <div className="text-[9px] text-slate-300 line-clamp-1 mb-1 font-medium">
              {activeTaskText}
            </div>

            {/* Progress Bar */}
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                style={{
                  width: `${isCollaborating ? 100 : agent.defaultProgress}%`,
                  backgroundColor: isCollaborating ? '#fbbf24' : dept.colorHex,
                }}
                className="h-full rounded-full transition-all duration-300"
              />
            </div>
          </div>
          )}
        </div>
      </Html>
    </group>
  );
};

// 4. Golden Laser Beam Connecting 2 Collaborating Desks during Handover
const HandoverGoldBeam3D: React.FC<{
  agents: AgentConfig[];
  activeHandover: HandoverStep;
  isSimulating: boolean;
}> = ({ agents, activeHandover, isSimulating }) => {
  const pulseRef1 = useRef<THREE.Mesh>(null);
  const pulseRef2 = useRef<THREE.Mesh>(null);

  const fromAgent = agents.find((a) => a.id === activeHandover.fromAgentId);
  const toAgent = agents.find((a) => a.id === activeHandover.toAgentId);

  const curveData = useMemo(() => {
    if (!fromAgent || !toAgent) return null;
    const start = new THREE.Vector3(
      fromAgent.deskPosition[0],
      1.25,
      fromAgent.deskPosition[2]
    );
    const end = new THREE.Vector3(
      toAgent.deskPosition[0],
      1.25,
      toAgent.deskPosition[2]
    );
    const mid = new THREE.Vector3()
      .addVectors(start, end)
      .multiplyScalar(0.5);
    const dist = start.distanceTo(end);
    mid.y = 2.6 + Math.min(dist * 0.16, 2.8);

    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    const floorStart = new THREE.Vector3(
      fromAgent.deskPosition[0],
      0.08,
      fromAgent.deskPosition[2]
    );
    const floorEnd = new THREE.Vector3(
      toAgent.deskPosition[0],
      0.08,
      toAgent.deskPosition[2]
    );

    return { start, mid, end, curve, floorStart, floorEnd };
  }, [fromAgent, toAgent]);

  useFrame(({ clock }) => {
    if (!curveData || !isSimulating) return;
    const t = clock.getElapsedTime();
    const p1 = (t * 0.65) % 1;
    const p2 = (t * 0.65 + 0.5) % 1;

    if (pulseRef1.current) {
      pulseRef1.current.position.copy(curveData.curve.getPoint(p1));
    }
    if (pulseRef2.current) {
      pulseRef2.current.position.copy(curveData.curve.getPoint(p2));
    }
  });

  if (!isSimulating || !curveData) return null;

  return (
    <group>
      {/* Overhead Arched Gold Laser Beam */}
      <QuadraticBezierLine
        start={curveData.start}
        end={curveData.end}
        mid={curveData.mid}
        color="#fbbf24"
        lineWidth={3.5}
        dashed={false}
      />

      {/* Direct Floor Gold Laser Line connecting the two desks */}
      <Line
        points={[curveData.floorStart, curveData.floorEnd]}
        color="#fbbf24"
        lineWidth={2.5}
        transparent
        opacity={0.85}
      />

      {/* Traveling Energy Spheres along the Gold Laser Beam */}
      <mesh ref={pulseRef1}>
        <sphereGeometry args={[0.16, 16, 16]} />
        <meshStandardMaterial
          color="#fef08a"
          emissive="#fbbf24"
          emissiveIntensity={3.5}
        />
      </mesh>
      <mesh ref={pulseRef2}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial
          color="#34d399"
          emissive="#10b981"
          emissiveIntensity={3.0}
        />
      </mesh>
    </group>
  );
};

// 5. Smooth Lerp Camera Rig
const CameraRig: React.FC<{
  agents: AgentConfig[];
  selectedAgentId: string | null;
  followSelected: boolean;
  autoRotate: boolean;
  resetCameraTrigger: number;
  activeHandover: HandoverStep;
  isSimulating: boolean;
  stepClock: StepClock;
  stepKey: string;
  homeCamPos: [number, number, number];
}> = ({
  agents,
  selectedAgentId,
  followSelected,
  autoRotate,
  resetCameraTrigger,
  activeHandover,
  isSimulating,
  stepClock,
  stepKey,
  homeCamPos,
}) => {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const desiredCamPos = useRef(new THREE.Vector3(...homeCamPos));
  const desiredTarget = useRef(new THREE.Vector3(0, 0.8, 0));
  const isTransitioning = useRef(false);
  const lastSelectedId = useRef<string | null>(null);
  const lastResetCount = useRef<number>(resetCameraTrigger);

  useFrame(({ camera, clock }) => {
    const t = clock.getElapsedTime();

    // Check if reset camera was triggered
    if (resetCameraTrigger !== lastResetCount.current) {
      lastResetCount.current = resetCameraTrigger;
      desiredCamPos.current.set(...homeCamPos);
      desiredTarget.current.set(0, 0.8, 0);
      isTransitioning.current = true;
    }

    // Check if selected agent changed
    if (selectedAgentId !== lastSelectedId.current) {
      lastSelectedId.current = selectedAgentId;
      if (selectedAgentId) {
        const ag = agents.find((a) => a.id === selectedAgentId);
        if (ag) {
          const [dx, , dz] = ag.deskPosition;
          const offset = new THREE.Vector3(0, 3.8, 5.2).applyAxisAngle(
            new THREE.Vector3(0, 1, 0),
            ag.deskRotationY
          );
          desiredCamPos.current.set(dx + offset.x, offset.y, dz + offset.z);
          desiredTarget.current.set(dx, 1.15, dz);
          isTransitioning.current = true;
        }
      }
    }

    // If "Theo dõi chọn" (Follow Selected) is active, continuously follow the selected agent's live position
    if (followSelected && selectedAgentId) {
      const ag = agents.find((a) => a.id === selectedAgentId);
      if (ag) {
        const liveState = getAgentCurrentWorldPos(
          ag,
          agents,
          activeHandover,
          isSimulating,
          getStepElapsed(stepClock, stepKey, t)
        );
        desiredTarget.current.set(
          liveState.position.x,
          1.2,
          liveState.position.z
        );
        desiredCamPos.current.set(
          liveState.position.x + 2.2,
          4.2,
          liveState.position.z + 5.2
        );
        isTransitioning.current = true;
      }
    }

    if (isTransitioning.current && controlsRef.current) {
      camera.position.lerp(desiredCamPos.current, 0.07);
      controlsRef.current.target.lerp(desiredTarget.current, 0.09);
      controlsRef.current.update();

      if (
        !followSelected &&
        camera.position.distanceTo(desiredCamPos.current) < 0.15 &&
        controlsRef.current.target.distanceTo(desiredTarget.current) < 0.1
      ) {
        isTransitioning.current = false;
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.06}
      autoRotate={autoRotate && !followSelected}
      autoRotateSpeed={0.65}
      minDistance={3}
      maxDistance={34}
      maxPolarAngle={Math.PI / 2 - 0.04}
      onStart={() => {
        if (!followSelected) {
          isTransitioning.current = false;
        }
      }}
    />
  );
};

export const VirtualTradingFloor: React.FC<VirtualTradingFloorProps> = ({
  agents,
  departments,
  selectedAgentId,
  onSelectAgent,
  activeHandover,
  isSimulating,
  showMT5Screens,
  followSelected,
  autoRotate,
  resetCameraTrigger,
  liveGoldPrice,
  customCommandOverride,
}) => {
  const isMobile = useIsMobile();

  // Đồng hồ bước dùng chung cho nhân vật & camera (xem StepClock)
  const stepClockRef = useRef<StepClock>({ key: '', start: 0 });
  const stepKey = `${activeHandover.stepIndex}|${isSimulating ? 1 : 0}`;

  // Kích thước sàn & vị trí camera chuẩn suy ra từ layout (tự giãn khi thêm Agent)
  const { floorW, floorD, homeCamPos } = useMemo(() => {
    let maxX = 0;
    let maxZ = 0;
    departments.forEach((d) => {
      maxX = Math.max(maxX, Math.abs(d.centerPosition[0]) + d.zoneSize[0] / 2);
      maxZ = Math.max(maxZ, Math.abs(d.centerPosition[2]) + d.zoneSize[1] / 2);
    });
    const w = Math.max(64, maxX * 2 + 14);
    const d = Math.max(48, maxZ * 2 + 14);
    // Màn dọc điện thoại có góc ngang hẹp => lùi camera xa hơn
    const scale = Math.max(1, maxX / 16) * (isMobile ? 1.75 : 1);
    const cam: [number, number, number] = [0, 14.5 * scale, 19.5 * scale];
    return { floorW: w, floorD: d, homeCamPos: cam };
  }, [departments, isMobile]);

  return (
    <div className="w-full h-full relative bg-slate-950 touch-none">
      <Canvas
        shadows={!isMobile}
        dpr={isMobile ? [1, 1.5] : [1, 2]}
        camera={{ position: homeCamPos, fov: 45, near: 0.1, far: 160 }}
        gl={{ antialias: !isMobile, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={['#020617']} />
        <fog attach="fog" args={['#020617', homeCamPos[2] + 6, homeCamPos[2] + 40]} />

        {/* Ambient & Institutional Prop Desk Lighting */}
        <ambientLight intensity={0.7} />
        <directionalLight
          position={[12, 22, 14]}
          intensity={1.35}
          castShadow={!isMobile}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        {/* Accent Point Lights over each Zone (theo layout tự động) */}
        {departments.map((d) => (
          <pointLight
            key={d.id}
            position={[d.centerPosition[0], 6, d.centerPosition[2]]}
            intensity={d.id === 'executive' ? 1.4 : 1.2}
            color={d.colorHex}
            distance={16}
          />
        ))}

        {/* Base Dark Reflective Trading Floor */}
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.01, 0]}
          receiveShadow
        >
          <planeGeometry args={[floorW, floorD]} />
          <meshStandardMaterial
            color="#030712"
            roughness={0.65}
            metalness={0.35}
          />
        </mesh>

        {/* Coordinate Grid Overlay */}
        <Grid
          position={[0, 0.005, 0]}
          args={[floorW - 12, floorD - 12]}
          cellSize={1}
          cellThickness={0.6}
          cellColor="#1e293b"
          sectionSize={4}
          sectionThickness={1.2}
          sectionColor="#334155"
          fadeDistance={homeCamPos[2] + 22}
          fadeStrength={1.2}
        />

        {/* 4 Glowing Department Zones on Floor */}
        {departments.map((dept) => (
          <DepartmentZone3D key={dept.id} dept={dept} />
        ))}

        {/* Dual-Monitor Workstations + Animated 3D Agents (số lượng theo AGENTS) */}
        {agents.map((agent) => {
          const dept =
            departments.find((d) => d.id === agent.departmentId) ||
            departments[0];
          const isSelected = selectedAgentId === agent.id;
          const isInvolved =
            isSimulating &&
            (activeHandover.fromAgentId === agent.id ||
              activeHandover.toAgentId === agent.id);

          return (
            <React.Fragment key={agent.id}>
              <WorkstationDesk3D
                agent={agent}
                dept={dept}
                isSelected={isSelected}
                isInvolvedInHandover={isInvolved}
                // Điện thoại: chỉ gắn màn hình MT5 cho bàn đang chọn / đang Handover
                showMT5Screens={
                  showMT5Screens && (!isMobile || isSelected || isInvolved)
                }
                liveGoldPrice={liveGoldPrice}
                onSelect={() => onSelectAgent(agent.id)}
              />
              <AgentCharacter3D
                agent={agent}
                dept={dept}
                allAgents={agents}
                activeHandover={activeHandover}
                isSimulating={isSimulating}
                isSelected={isSelected}
                onSelect={() => onSelectAgent(agent.id)}
                stepClock={stepClockRef.current}
                stepKey={stepKey}
                compactLabel={isMobile}
                customCommandOverride={customCommandOverride}
              />
            </React.Fragment>
          );
        })}

        {/* Gold Laser Beam connecting collaborating desks */}
        <HandoverGoldBeam3D
          agents={agents}
          activeHandover={activeHandover}
          isSimulating={isSimulating}
        />

        {/* Smooth Camera Controller */}
        <CameraRig
          agents={agents}
          selectedAgentId={selectedAgentId}
          followSelected={followSelected}
          autoRotate={autoRotate}
          resetCameraTrigger={resetCameraTrigger}
          activeHandover={activeHandover}
          isSimulating={isSimulating}
          stepClock={stepClockRef.current}
          stepKey={stepKey}
          homeCamPos={homeCamPos}
        />
      </Canvas>
    </div>
  );
};
