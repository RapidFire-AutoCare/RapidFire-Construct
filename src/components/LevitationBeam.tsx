import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { INTRO, segmentProgress, smoothstep01 } from '../introTimeline'
import { LOGO_HOVER_Y, PLATFORM_RADIUS } from './platform'

const FIRE = new THREE.Color('#ff6a1a')
const FIRE_DEEP = new THREE.Color('#ff4500')
const CYAN = new THREE.Color('#5ec8ff')
const EMBER_COUNT = 48
const R = PLATFORM_RADIUS

/** Beam root Y — keep in sync with group position below */
const BEAM_Y = -0.84

/** Thin perimeter wall only — interior stays dark */
const SHELL_RADII = [R * 0.97, R]

function createHoloShellMaterial(intensity: number, dashScale = 36) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uIntensity: { value: intensity },
      uDash: { value: dashScale },
      uFire: { value: FIRE.clone() },
      uDeep: { value: FIRE_DEEP.clone() },
      uCyan: { value: CYAN.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpacity;
      uniform float uIntensity;
      uniform float uDash;
      uniform vec3 uFire;
      uniform vec3 uDeep;
      uniform vec3 uCyan;
      varying vec2 vUv;

      void main() {
        float around = vUv.x;
        float h = vUv.y;

        float vertical = mix(0.5, 1.0, pow(1.0 - h, 0.35));
        vertical *= smoothstep(0.0, 0.04, h) * smoothstep(1.0, 0.55, h);
        float logoClear =
          1.0 - 0.6 * smoothstep(0.18, 0.3, h) * smoothstep(0.58, 0.4, h);
        vertical *= logoClear;

        float dash = step(0.55, fract(around * uDash - uTime * 0.14));
        float tick = step(0.9, fract(around * (uDash * 0.45) + uTime * 0.04));
        float scan = smoothstep(0.08, 0.0, abs(fract(h * 16.0 - uTime * 0.32) - 0.5));

        float density = vertical * (0.1 + dash * 0.35 + tick * 0.25 + scan * 0.1);
        density *= uIntensity;

        vec3 col = mix(uDeep, uFire, dash * 0.55 + tick * 0.2);
        col = mix(col, uCyan, scan * 0.1);
        col *= density;

        gl_FragColor = vec4(col, density * uOpacity);
      }
    `,
  })
}

function createEmberCloud() {
  const positions = new Float32Array(EMBER_COUNT * 3)
  const speeds = new Float32Array(EMBER_COUNT)
  const phases = new Float32Array(EMBER_COUNT)
  const sizes = new Float32Array(EMBER_COUNT)

  for (let i = 0; i < EMBER_COUNT; i++) {
    const a = Math.random() * Math.PI * 2
    const r = (0.9 + Math.random() * 0.08) * R
    positions[i * 3] = Math.cos(a) * r
    positions[i * 3 + 1] = Math.random() * 4.5
    positions[i * 3 + 2] = Math.sin(a) * r
    speeds[i] = 0.2 + Math.random() * 0.45
    phases[i] = Math.random() * Math.PI * 2
    sizes[i] = 0.35 + Math.random() * 0.7
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1))
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  return geo
}

function createEmberMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uFire: { value: FIRE.clone() },
    },
    vertexShader: /* glsl */ `
      attribute float aSpeed;
      attribute float aPhase;
      attribute float aSize;
      uniform float uTime;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        float h = mod(p.y + uTime * aSpeed, 4.6);
        p.y = h;
        float spin = uTime * 0.12 + aPhase;
        float rr = length(p.xz);
        p.x = cos(spin) * rr;
        p.z = sin(spin) * rr;

        float logoHide = 1.0 - smoothstep(0.95, 1.35, h) * smoothstep(2.7, 1.85, h);
        float life = smoothstep(0.0, 0.12, h) * smoothstep(4.6, 3.3, h) * logoHide;
        vAlpha = life * (0.35 + 0.65 * fract(aPhase));

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (8.0 + aSize * 8.0) * (1.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform vec3 uFire;
      varying float vAlpha;
      void main() {
        float glow = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
        float a = glow * glow * vAlpha * uOpacity;
        gl_FragColor = vec4(mix(uFire, vec3(1.0, 0.9, 0.75), glow * 0.4), a);
      }
    `,
  })
}

/**
 * Dark-core tractor beam — black pocket for the logo, lit rim walls only.
 */
export function LevitationBeam({ reducedMotion }: { reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null)
  const shellMats = useMemo(
    () =>
      SHELL_RADII.map((_, i) => {
        const t = i / (SHELL_RADII.length - 1)
        return createHoloShellMaterial(0.5 + t * 0.45, 34 + i * 6)
      }),
    [],
  )
  const emberGeo = useMemo(() => createEmberCloud(), [])
  const emberMat = useMemo(() => createEmberMaterial(), [])
  const coreMat = useRef<THREE.MeshBasicMaterial>(null)
  const apertureMat = useRef<THREE.MeshBasicMaterial>(null)
  const rimMat = useRef<THREE.MeshBasicMaterial>(null)
  const risingRings = useRef<THREE.Group>(null)

  const height = 5.2
  const logoLocalY = LOGO_HOVER_Y - BEAM_Y

  useFrame((state) => {
    const intro = reducedMotion
      ? 1
      : smoothstep01(segmentProgress(INTRO.beamAt, INTRO.beamDur))
    const t = state.clock.elapsedTime
    const breathe = reducedMotion ? 1 : 0.94 + Math.sin(t * 1.2) * 0.06

    for (let i = 0; i < shellMats.length; i++) {
      const mat = shellMats[i]
      const edge = i / (shellMats.length - 1)
      mat.uniforms.uTime.value = t * (1 + i * 0.03)
      mat.uniforms.uOpacity.value = (0.14 + edge * 0.18) * intro * breathe
    }

    emberMat.uniforms.uTime.value = reducedMotion ? 0 : t
    emberMat.uniforms.uOpacity.value = (reducedMotion ? 0.06 : 0.14) * intro

    if (coreMat.current) coreMat.current.opacity = 0.55 * intro
    if (apertureMat.current) apertureMat.current.opacity = 0.06 * intro * breathe
    if (rimMat.current) {
      rimMat.current.opacity =
        0.4 * intro * (reducedMotion ? 1 : 0.9 + Math.sin(t * 1.6) * 0.1)
    }
    if (group.current && !reducedMotion) group.current.rotation.y = t * 0.025

    if (risingRings.current && !reducedMotion) {
      risingRings.current.children.forEach((child, i) => {
        const mesh = child as THREE.Mesh
        const phase = (t * 0.28 + i / risingRings.current!.children.length) % 1
        let y = 0.1 + phase * 4.8
        const pocketMin = logoLocalY - 0.75
        const pocketMax = logoLocalY + 0.75
        if (y > pocketMin && y < pocketMax) y += pocketMax - pocketMin + 0.2
        mesh.position.y = y
        const mat = mesh.material as THREE.MeshBasicMaterial
        mat.opacity = Math.sin(phase * Math.PI) * 0.18 * intro
        mesh.scale.setScalar(0.97 + phase * 0.04)
      })
    }
  })

  return (
    <group ref={group} position={[0, BEAM_Y, 0]}>
      {/* Dark tube walls — BackSide only so exterior orbit/b-roll isn't a black slab */}
      <mesh position={[0, height * 0.5, 0]}>
        <cylinderGeometry args={[R * 0.92, R * 0.92, height * 0.99, 48, 1, true]} />
        <meshBasicMaterial
          ref={coreMat}
          color="#05070c"
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.BackSide}
        />
      </mesh>

      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[R * 0.99, 64]} />
        <meshBasicMaterial
          ref={apertureMat}
          color="#ff6a1a"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[R * 0.94, R * 1.02, 80]} />
        <meshBasicMaterial
          ref={rimMat}
          color="#ff4500"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      {SHELL_RADII.map((radius, i) => (
        <mesh
          key={radius}
          position={[0, height * 0.5, 0]}
          rotation={[0, i * 0.6, 0]}
          material={shellMats[i]}
        >
          <cylinderGeometry args={[radius * 1.008, radius, height, 96, 1, true]} />
        </mesh>
      ))}

      <group ref={risingRings}>
        {[0, 1].map((i) => (
          <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
            <ringGeometry args={[R * 0.94, R * 0.995, 64]} />
            <meshBasicMaterial
              color={i % 2 === 0 ? '#ff6a1a' : '#5ec8ff'}
              transparent
              opacity={0}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
      </group>

      <points geometry={emberGeo} material={emberMat} />
    </group>
  )
}
