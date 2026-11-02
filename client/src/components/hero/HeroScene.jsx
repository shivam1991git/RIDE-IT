// Lazy-loaded WebGL hero: a stylised car driving a glowing route between two
// pins. Built from primitives (no model download), so the whole scene is code.
import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Grid, Line, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

const SAFFRON = '#FF9F1C';
const TEAL = '#2EC4B6';

function useRoute() {
  return useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(-3.4, 0.02, 1.2),
    new THREE.Vector3(-1.8, 0.02, -0.6),
    new THREE.Vector3(0.1, 0.02, 0.5),
    new THREE.Vector3(1.8, 0.02, -1.1),
    new THREE.Vector3(3.4, 0.02, 0),
  ]), []);
}

function Wheel({ position }) {
  return (
    <mesh position={position} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.2, 0.2, 0.16, 20]} />
      <meshStandardMaterial color="#0B0C0F" roughness={0.8} />
    </mesh>
  );
}

function Car({ curve }) {
  const ref = useRef();
  const progress = useRef(0);
  const tangent = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, delta) => {
    progress.current = (progress.current + delta * 0.06) % 1;
    const t = 0.08 + progress.current * 0.84;
    const point = curve.getPointAt(t);
    curve.getTangentAt(t, tangent);
    ref.current.position.set(point.x, 0.32, point.z);
    ref.current.rotation.y = Math.atan2(-tangent.z, tangent.x);
  });
  return (
    <group ref={ref} scale={0.75}>
      <RoundedBox args={[2.1, 0.5, 1]} radius={0.16} smoothness={4} castShadow>
        <meshStandardMaterial color={SAFFRON} roughness={0.35} metalness={0.25} />
      </RoundedBox>
      <RoundedBox args={[1.15, 0.42, 0.9]} radius={0.16} smoothness={4} position={[-0.1, 0.42, 0]}>
        <meshStandardMaterial color="#14171D" roughness={0.15} metalness={0.6} />
      </RoundedBox>
      <mesh position={[1.06, 0.02, 0.3]}><boxGeometry args={[0.04, 0.1, 0.2]} /><meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={2} /></mesh>
      <mesh position={[1.06, 0.02, -0.3]}><boxGeometry args={[0.04, 0.1, 0.2]} /><meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={2} /></mesh>
      <mesh position={[-1.06, 0.04, 0.3]}><boxGeometry args={[0.04, 0.08, 0.22]} /><meshStandardMaterial color="#ff3b30" emissive="#ff3b30" emissiveIntensity={1.5} /></mesh>
      <mesh position={[-1.06, 0.04, -0.3]}><boxGeometry args={[0.04, 0.08, 0.22]} /><meshStandardMaterial color="#ff3b30" emissive="#ff3b30" emissiveIntensity={1.5} /></mesh>
      <Wheel position={[0.65, -0.24, 0.5]} />
      <Wheel position={[0.65, -0.24, -0.5]} />
      <Wheel position={[-0.65, -0.24, 0.5]} />
      <Wheel position={[-0.65, -0.24, -0.5]} />
    </group>
  );
}

function Pin({ position, color, square }) {
  return (
    <Float speed={2} rotationIntensity={0} floatIntensity={0.6} floatingRange={[0, 0.25]}>
      <group position={position}>
        <mesh position={[0, 0.9, 0]}>
          {square ? <boxGeometry args={[0.36, 0.36, 0.36]} /> : <sphereGeometry args={[0.22, 24, 24]} />}
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
        </mesh>
        <mesh position={[0, 0.45, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.8, 8]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>
      <mesh position={[position[0], 0.015, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.18, 0.32, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} />
      </mesh>
    </Float>
  );
}

function Route({ curve }) {
  const ref = useRef();
  const points = useMemo(() => curve.getPoints(120), [curve]);
  useFrame((state, delta) => {
    if (ref.current?.material) ref.current.material.dashOffset -= delta * 0.6;
  });
  return (
    <>
      <Line points={points} color={TEAL} lineWidth={10} transparent opacity={0.16} />
      <Line ref={ref} points={points} color={TEAL} lineWidth={3} dashed dashSize={0.3} gapSize={0.22} />
    </>
  );
}

function Rig() {
  useFrame(state => {
    const { x, y } = state.pointer;
    state.camera.position.x += (x * 0.9 - state.camera.position.x) * 0.04;
    state.camera.position.y += (5.4 + y * 0.4 - state.camera.position.y) * 0.04;
    state.camera.lookAt(0, 0, 0);
  });
  return null;
}

export default function HeroScene({ dark = true }) {
  const curve = useRoute();
  return (
    <Canvas camera={{ position: [0, 5.4, 8.2], fov: 48 }} dpr={[1, 1.75]} gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }} aria-hidden>
      <ambientLight intensity={dark ? 0.55 : 0.9} />
      <directionalLight position={[5, 8, 4]} intensity={dark ? 1.6 : 1.9} />
      <pointLight position={[-4, 3, -3]} intensity={18} color={SAFFRON} distance={12} />
      <Grid
        position={[0, 0, 0]}
        args={[30, 30]}
        cellSize={0.5}
        cellThickness={0.6}
        cellColor={dark ? '#1E222B' : '#D9D4CA'}
        sectionSize={2.5}
        sectionThickness={1}
        sectionColor={dark ? '#2A2F3A' : '#C7C0B3'}
        fadeDistance={16}
        fadeStrength={1.6}
        infiniteGrid
      />
      <Route curve={curve} />
      <Pin position={[-3.4, 0, 1.2]} color={TEAL} />
      <Pin position={[3.4, 0, 0]} color={SAFFRON} square />
      <Car curve={curve} />
      <Rig />
    </Canvas>
  );
}
