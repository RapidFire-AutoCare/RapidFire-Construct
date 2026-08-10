import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Group, Mesh } from 'three'
import { INTRO, segmentProgress, smoothstep01 } from '../introTimeline'
import { PLATFORM_RADIUS } from './platform'

const FIRE = new THREE.Color('#ff4500')
const FIRE_HOT = new THREE.Color('#ff6a1a')
const FIRE_DEEP_SOFT = new THREE.Color('#3a1200')
const R = PLATFORM_RADIUS

/**
 * Precision levitation plinth — top face flush to outer edge
 * so the tractor beam can fill the entire platform.
 */
export function LogoPedestal({ reducedMotion }: { reducedMotion: boolean }) {
  const root = useRef<Group>(null)
  const seamMat = useRef<THREE.MeshStandardMaterial>(null)
  const poolMat = useRef<THREE.MeshBasicMaterial>(null)
  const edgeGlowMat = useRef<THREE.MeshBasicMaterial>(null)
  const rimSpin = useRef<Group>(null)
  const leds = useRef<THREE.MeshStandardMaterial[]>([])
  const padLight = useRef<THREE.PointLight>(null)
  const underLight = useRef<THREE.PointLight>(null)
  const caustic = useRef<Mesh>(null)

  const deckMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#0a0d14',
        metalness: 0.92,
        roughness: 0.14,
        envMapIntensity: 1.35,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        emissive: FIRE_DEEP_SOFT,
        emissiveIntensity: 0.08,
      }),
    [],
  )

  useFrame((state) => {
    const intro = reducedMotion
      ? 1
      : smoothstep01(segmentProgress(INTRO.pedestalAt, INTRO.pedestalDur))
    const t = state.clock.elapsedTime
    const breathe = reducedMotion ? 1 : 0.86 + Math.sin(t * 1.4) * 0.14

    if (root.current) {
      root.current.scale.setScalar(THREE.MathUtils.lerp(0.94, 1, intro))
      root.current.visible = intro > 0.02
    }

    if (rimSpin.current && !reducedMotion) {
      rimSpin.current.rotation.y = t * 0.32
    }

    if (seamMat.current) {
      seamMat.current.emissiveIntensity = 2.2 * intro * breathe
    }

    if (poolMat.current) {
      poolMat.current.opacity = 0.14 * intro * breathe
    }

    if (edgeGlowMat.current) {
      edgeGlowMat.current.opacity = 0.45 * intro * breathe
    }

    if (caustic.current) {
      const s = reducedMotion ? 1 : 0.96 + Math.sin(t * 1.35) * 0.04
      caustic.current.scale.setScalar(s)
    }

    if (padLight.current) {
      padLight.current.intensity = 0.9 * intro * breathe
    }
    if (underLight.current) {
      underLight.current.intensity = 0.35 * intro * breathe
    }

    for (let i = 0; i < leds.current.length; i++) {
      const mat = leds.current[i]
      if (!mat) continue
      if (reducedMotion) {
        mat.emissiveIntensity = 1.1 * intro
        continue
      }
      const beat = (t * 1.25 + i * 0.5) % 2.8
      mat.emissiveIntensity = (beat < 0.4 ? 1.6 : 0.2) * intro
    }
  })

  return (
    <group ref={root} position={[0, -1.05, 0]}>
      {/* Tapered body — outer top matches beam radius */}
      <mesh>
        <cylinderGeometry args={[R * 0.98, R * 1.08, 0.18, 72]} />
        <meshStandardMaterial
          color="#10141c"
          metalness={0.97}
          roughness={0.28}
          envMapIntensity={1.15}
        />
      </mesh>

      {/* Beveled shoulder */}
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[R * 0.995, R * 0.98, 0.07, 72]} />
        <meshStandardMaterial
          color="#1c222e"
          metalness={0.98}
          roughness={0.18}
          envMapIntensity={1.3}
        />
      </mesh>

      {/* Full-width polished deck — flush to platform edge */}
      <mesh position={[0, 0.175, 0]} material={deckMat}>
        <cylinderGeometry args={[R, R, 0.04, 72]} />
      </mesh>

      {/* Chrome knife-edge on the outer perimeter */}
      <mesh position={[0, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[R * 0.985, 0.014, 12, 96]} />
        <meshStandardMaterial
          color="#f0f4f8"
          metalness={1}
          roughness={0.1}
          envMapIntensity={1.5}
        />
      </mesh>

      {/* Fire lip locked to outer edge */}
      <mesh position={[0, 0.208, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[R * 0.97, 0.01, 10, 96]} />
        <meshBasicMaterial
          ref={edgeGlowMat}
          color={FIRE_HOT}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      {/* Traveling seam inside the edge channel */}
      <group ref={rimSpin} position={[0, 0.21, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[R * 0.88, R * 0.91, 96, 1, 0, Math.PI * 0.5]} />
          <meshStandardMaterial
            ref={seamMat}
            color={FIRE_HOT}
            emissive={FIRE}
            emissiveIntensity={0}
            metalness={0.15}
            roughness={0.3}
            toneMapped={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      {/* Energy pool covering the whole deck */}
      <mesh ref={caustic} position={[0, 0.202, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[R * 0.96, 72]} />
        <meshBasicMaterial
          ref={poolMat}
          color={FIRE}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      {/* Status LEDs on the shoulder */}
      {[0, 1, 2, 3].map((i) => {
        const a = -0.7 + i * 0.16
        return (
          <mesh
            key={i}
            position={[Math.sin(a) * R * 0.92, 0.13, Math.cos(a) * R * 0.92]}
          >
            <sphereGeometry args={[0.013, 10, 10]} />
            <meshStandardMaterial
              ref={(mat) => {
                if (mat) leds.current[i] = mat
              }}
              color="#0a0a0a"
              emissive={FIRE_HOT}
              emissiveIntensity={0}
              toneMapped={false}
            />
          </mesh>
        )
      })}

      <pointLight
        ref={padLight}
        position={[0, 0.5, 0]}
        color="#ff5a12"
        intensity={0}
        distance={4.5}
        decay={2}
      />
      <pointLight
        ref={underLight}
        position={[0, -0.15, 0]}
        color="#ff4500"
        intensity={0}
        distance={2.5}
        decay={2}
      />
    </group>
  )
}
