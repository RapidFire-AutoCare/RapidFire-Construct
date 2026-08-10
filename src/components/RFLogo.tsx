import { Center, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import type { Group, LineSegments, Mesh } from 'three'
import { DRACO_PATH, MODEL_PATH } from '../brand'
import { INTRO, pageElapsedSec } from '../introTimeline'

useGLTF.setDecoderPath(DRACO_PATH)

const ORANGE = new THREE.Color('#ff6a1a')

function enhanceMaterial(mat: THREE.Material): THREE.Material {
  const std = mat as THREE.MeshStandardMaterial
  if (!std?.isMeshStandardMaterial) return mat

  const color = std.color
  const isOrange =
    color.r > 0.45 && color.g < 0.55 && color.b < 0.35 && color.r > color.g
  const isChrome =
    std.metalness > 0.5 || (color.r > 0.6 && color.g > 0.6 && color.b > 0.6)

  // Physical materials pick up beam speculars / clearcoat bloom more cleanly.
  // Don't use .copy(std) — Physical.copy expects Physical fields (Vector2 etc).
  const base = new THREE.MeshPhysicalMaterial({
    color: std.color.clone(),
    map: std.map,
    metalness: std.metalness,
    roughness: std.roughness,
    metalnessMap: std.metalnessMap,
    roughnessMap: std.roughnessMap,
    normalMap: std.normalMap,
    normalScale: std.normalScale?.clone(),
    emissive: std.emissive?.clone() ?? new THREE.Color(0x000000),
    emissiveIntensity: std.emissiveIntensity ?? 0,
    emissiveMap: std.emissiveMap,
    envMap: std.envMap,
    envMapIntensity: std.envMapIntensity,
    aoMap: std.aoMap,
    aoMapIntensity: std.aoMapIntensity,
    bumpMap: std.bumpMap,
    bumpScale: std.bumpScale,
    displacementMap: std.displacementMap,
    displacementScale: std.displacementScale,
    displacementBias: std.displacementBias,
    alphaMap: std.alphaMap,
    lightMap: std.lightMap,
    lightMapIntensity: std.lightMapIntensity,
    side: std.side,
    flatShading: std.flatShading,
    wireframe: std.wireframe,
  })

  if (isOrange) {
    base.color = std.color.clone().offsetHSL(0, 0.06, 0.08)
    base.emissive = new THREE.Color('#ff4500')
    base.emissiveIntensity = 0.5
    base.metalness = Math.max(std.metalness, 0.55)
    base.roughness = THREE.MathUtils.clamp(std.roughness, 0.18, 0.4)
    base.envMapIntensity = 1.35
    base.clearcoat = 0.55
    base.clearcoatRoughness = 0.25
    base.userData.kind = 'orange'
  } else if (isChrome) {
    base.metalness = 1
    base.roughness = 0.08
    base.envMapIntensity = 1.85
    base.clearcoat = 1
    base.clearcoatRoughness = 0.06
    base.emissive = new THREE.Color('#1a120c')
    base.emissiveIntensity = 0.12
    base.sheen = 0.35
    base.sheenRoughness = 0.45
    base.sheenColor = new THREE.Color('#ff6a1a')
    base.userData.kind = 'chrome'
  } else {
    base.envMapIntensity = 1.2
    base.clearcoat = 0.25
    base.clearcoatRoughness = 0.35
    base.userData.kind = 'other'
  }

  base.transparent = true
  base.opacity = 1
  base.userData.baseEnv = base.envMapIntensity
  base.userData.baseEmissive = base.emissiveIntensity ?? 0
  base.userData.baseRoughness = base.roughness
  base.needsUpdate = true
  return base
}

/** Beam catch / mouse-follow specular response on logo materials */
function applyBeamCatch(
  meshes: Mesh[],
  tiltX: number,
  tiltY: number,
  spinY: number,
  time: number,
) {
  const tilt = Math.min(1.35, Math.hypot(tiltX, tiltY) * 1.45)
  const sweep = Math.sin(tiltY * 2.4 + spinY * 1.2 + time * 0.7) * 0.5 + 0.5
  const pulse = 0.92 + Math.sin(time * 2.1) * 0.08
  const catchAmt = (0.55 + tilt * 0.9 + sweep * 0.45) * pulse

  for (const mesh of meshes) {
    for (const mat of materialsOf(mesh)) {
      const m = mat as THREE.MeshPhysicalMaterial
      if (!m.isMeshPhysicalMaterial && !(m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        continue
      }
      const kind = m.userData.kind as string | undefined
      const baseEnv = (m.userData.baseEnv as number) ?? 1
      const baseEm = (m.userData.baseEmissive as number) ?? 0
      const baseRough = (m.userData.baseRoughness as number) ?? m.roughness
      const opacity = m.opacity

      if (kind === 'chrome') {
        m.envMapIntensity = baseEnv * (0.85 + catchAmt * 0.95) * opacity
        m.emissiveIntensity = baseEm * (0.7 + catchAmt * 1.6) * opacity
        m.roughness = THREE.MathUtils.lerp(baseRough, 0.035, Math.min(1, catchAmt * 0.7))
        m.clearcoat = 1
        m.clearcoatRoughness = THREE.MathUtils.lerp(0.12, 0.02, sweep)
        m.sheen = 0.25 + catchAmt * 0.55
        m.sheenRoughness = THREE.MathUtils.lerp(0.55, 0.18, sweep)
        m.sheenColor.setHSL(0.055, 0.95, 0.45 + sweep * 0.2)
      } else if (kind === 'orange') {
        m.envMapIntensity = baseEnv * (0.9 + catchAmt * 0.85) * opacity
        m.emissiveIntensity = baseEm * (0.85 + catchAmt * 1.35) * opacity
        m.roughness = THREE.MathUtils.lerp(baseRough, baseRough * 0.55, tilt)
        m.clearcoat = 0.45 + sweep * 0.45
        m.clearcoatRoughness = THREE.MathUtils.lerp(0.35, 0.1, catchAmt)
      } else {
        m.envMapIntensity = baseEnv * (0.9 + catchAmt * 0.4) * opacity
      }
    }
  }
}

function materialsOf(mesh: Mesh) {
  return (
    Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  ).filter(Boolean) as THREE.Material[]
}

function setMeshOpacity(mesh: Mesh, opacity: number) {
  const o = THREE.MathUtils.clamp(opacity, 0, 1)
  for (const mat of materialsOf(mesh)) {
    const m = mat as THREE.MeshStandardMaterial
    m.transparent = true
    m.opacity = o
    m.depthWrite = o > 0.9
    m.envMapIntensity = ((m.userData.baseEnv as number) ?? 1) * o
    m.emissiveIntensity = ((m.userData.baseEmissive as number) ?? 0) * o
  }
}

function createTraceGeometry(source: THREE.BufferGeometry) {
  // Higher threshold → cleaner silhouette lines (reads more as wireframe)
  const edges = new THREE.EdgesGeometry(source, 35)
  const pos = edges.attributes.position
  const count = pos.count
  const lineDistance = new Float32Array(count)
  let dist = 0

  for (let i = 0; i + 1 < count; i += 2) {
    const ax = pos.getX(i)
    const ay = pos.getY(i)
    const az = pos.getZ(i)
    const bx = pos.getX(i + 1)
    const by = pos.getY(i + 1)
    const bz = pos.getZ(i + 1)
    const seg = Math.hypot(bx - ax, by - ay, bz - az)
    lineDistance[i] = dist
    dist += seg
    lineDistance[i + 1] = dist
  }

  edges.setAttribute('lineDistance', new THREE.BufferAttribute(lineDistance, 1))
  edges.userData.totalDistance = Math.max(dist, 0.0001)
  return edges
}

function createTraceMaterial(color: THREE.Color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uProgress: { value: 0 },
      uTotal: { value: 1 },
      uColor: { value: color.clone() },
      uOpacity: { value: 1 },
      uTime: { value: 0 },
      uPulse: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float lineDistance;
      varying float vDist;
      void main() {
        vDist = lineDistance;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uProgress;
      uniform float uTotal;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      uniform float uPulse;
      varying float vDist;

      void main() {
        float head = uProgress * uTotal;
        float width = max(uTotal * 0.028, 0.02);
        float drawn = 1.0 - smoothstep(head, head + width, vDist);
        if (uProgress <= 0.001 && uPulse < 0.01) discard;

        float norm = vDist / max(uTotal, 0.0001);
        float travel = fract(norm - uTime * 0.14);
        float band = 1.0 - smoothstep(0.0, 0.075, min(travel, 1.0 - travel));
        float breathe = 0.4 + 0.6 * (0.5 + 0.5 * sin(uTime * 1.9));
        float pulseAlpha = breathe * (0.2 + band * 0.85);

        float alpha = mix(drawn, pulseAlpha, uPulse) * uOpacity;
        if (alpha < 0.02) discard;

        float tip = 1.0 - smoothstep(0.0, width * 1.5, max(head - vDist, 0.0));
        float glow = mix(tip * 0.75, band * 0.95, uPulse);
        vec3 col = mix(uColor, vec3(1.0, 0.94, 0.75), glow);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  })
}

type Layer = {
  mesh: Mesh
  trace: LineSegments
  traceMat: THREE.ShaderMaterial
}

type RFLogoProps = {
  scale?: number
  /** Fit the logo's bounding diameter to this world size (overrides scale) */
  fitDiameter?: number
  reducedMotion?: boolean
  /** Follow / drag tilt from LogoRig — drives beam speculars */
  tiltRef?: MutableRefObject<{ x: number; y: number }>
  /** Spin yaw from LogoRig */
  spinRef?: MutableRefObject<number>
}

export function RFLogo({
  scale = 1,
  fitDiameter,
  reducedMotion = false,
  tiltRef,
  spinRef,
}: RFLogoProps) {
  const { scene } = useGLTF(MODEL_PATH, true)
  const root = useRef<Group>(null)
  const layersRef = useRef<Layer[]>([])
  const meshesRef = useRef<Mesh[]>([])
  const armed = useRef(false)
  const done = useRef(reducedMotion)
  /** Local clock — starts when the logo is ready AND its intro slot opens */
  const revealStartedAt = useRef(-1)

  const model = useMemo(() => {
    const clone = scene.clone(true)
    const meshes: Mesh[] = []

    clone.traverse((obj) => {
      if (!(obj as Mesh).isMesh) return
      const mesh = obj as Mesh
      mesh.visible = true
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.renderOrder = 20
      if (mesh.geometry && !mesh.geometry.attributes.normal) {
        mesh.geometry.computeVertexNormals()
      }
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => enhanceMaterial(m))
      } else if (mesh.material) {
        mesh.material = enhanceMaterial(mesh.material)
      }
      setMeshOpacity(mesh, 1)
      meshes.push(mesh)
    })

    meshesRef.current = meshes

    if (reducedMotion) {
      layersRef.current = []
      return clone
    }

    // Outlines are siblings under clone (not mesh children) so solids can hide
    clone.updateMatrixWorld(true)
    const cloneInv = clone.matrixWorld.clone().invert()
    const outlineRoot = new THREE.Group()
    outlineRoot.name = 'logo-outlines'
    clone.add(outlineRoot)

    const layers: Layer[] = []
    for (const mesh of meshes) {
      // Bright HUD orange for the draw-on so it reads clearly as wireframe
      const traceGeo = createTraceGeometry(mesh.geometry)
      const traceMat = createTraceMaterial(ORANGE)
      traceMat.uniforms.uTotal.value = traceGeo.userData.totalDistance as number

      const trace = new THREE.LineSegments(traceGeo, traceMat)
      trace.frustumCulled = false
      trace.renderOrder = 30
      trace.matrixAutoUpdate = false
      trace.matrix
        .copy(mesh.matrixWorld)
        .premultiply(cloneInv)
        .multiply(new THREE.Matrix4().makeScale(1.015, 1.015, 1.015))
      outlineRoot.add(trace)

      layers.push({ mesh, trace, traceMat })
    }

    layersRef.current = layers
    return clone
  }, [scene, reducedMotion])

  const fittedScale = useMemo(() => {
    if (!fitDiameter) return scale
    // Measure mesh geometry only (ignore outline lines). Use min(x,y) so
    // speed-flame overhang doesn't shrink the circular badge relative to the pad.
    const box = new THREE.Box3()
    const temp = new THREE.Box3()
    model.updateMatrixWorld(true)
    model.traverse((obj) => {
      const mesh = obj as Mesh
      if (!mesh.isMesh || !mesh.geometry) return
      const geo = mesh.geometry
      if (!geo.boundingBox) geo.computeBoundingBox()
      if (!geo.boundingBox) return
      temp.copy(geo.boundingBox).applyMatrix4(mesh.matrixWorld)
      box.union(temp)
    })
    const size = box.getSize(new THREE.Vector3())
    const ringDiameter = Math.max(Math.min(size.x, size.y), 0.0001)
    return (fitDiameter / ringDiameter) * scale
  }, [fitDiameter, model, scale])

  useEffect(() => {
    done.current = reducedMotion
    armed.current = false
    revealStartedAt.current = -1

    if (reducedMotion) {
      for (const mesh of meshesRef.current) {
        mesh.visible = true
        setMeshOpacity(mesh, 1)
      }
      return
    }

    // Center already measured — hide until reveal plays from the start
    for (const mesh of meshesRef.current) {
      mesh.visible = false
      setMeshOpacity(mesh, 0)
    }
    for (const layer of layersRef.current) {
      layer.trace.visible = false
      layer.traceMat.uniforms.uProgress.value = 0
      layer.traceMat.uniforms.uPulse.value = 0
      layer.traceMat.uniforms.uOpacity.value = 0
    }
    if (root.current) root.current.scale.setScalar(0.82)
    armed.current = true

    const failsafe = window.setTimeout(() => {
      done.current = true
      for (const mesh of meshesRef.current) {
        mesh.visible = true
        setMeshOpacity(mesh, 1)
      }
      for (const layer of layersRef.current) {
        layer.trace.visible = true
        layer.traceMat.uniforms.uProgress.value = 1
        layer.traceMat.uniforms.uPulse.value = 1
        layer.traceMat.uniforms.uOpacity.value = 0.85
      }
      if (root.current) root.current.scale.setScalar(1)
    }, 5000)

    return () => window.clearTimeout(failsafe)
  }, [model, reducedMotion])

  useFrame((state) => {
    if (!root.current || reducedMotion) return

    const layers = layersRef.current
    const meshes = meshesRef.current
    const clock = state.clock.elapsedTime

    if (!layers.length) {
      for (const mesh of meshes) {
        mesh.visible = true
        setMeshOpacity(mesh, 1)
      }
      return
    }

    if (!armed.current) return

    // Wait for the intro slot, then always play the full entrance from 0
    // (even if the GLB loaded late — never skip the first animated appearance)
    if (pageElapsedSec() < INTRO.logoDrawAt) {
      for (const mesh of meshes) {
        mesh.visible = false
        setMeshOpacity(mesh, 0)
      }
      for (const layer of layers) {
        layer.trace.visible = false
        layer.traceMat.uniforms.uProgress.value = 0
        layer.traceMat.uniforms.uOpacity.value = 0
      }
      root.current.scale.setScalar(0.82)
      return
    }

    if (revealStartedAt.current < 0) {
      revealStartedAt.current = performance.now()
    }

    const logoElapsed = (performance.now() - revealStartedAt.current) / 1000
    const drawEnd = INTRO.logoDrawDur
    const fillEnd = INTRO.logoDrawDur + INTRO.logoFillDur

    // Entrance: scale + fade the wireframe in as it begins drawing
    const enterT = THREE.MathUtils.clamp(logoElapsed / 0.4, 0, 1)
    const enterEase = 1 - (1 - enterT) ** 3
    if (!done.current) {
      root.current.scale.setScalar(THREE.MathUtils.lerp(0.82, 1, enterEase))
    }

    if (logoElapsed < drawEnd) {
      // 1) First appearance — animated wireframe draw-on
      const drawT = logoElapsed / drawEnd
      const drawEase = 1 - (1 - drawT) ** 2.5

      for (const mesh of meshes) {
        mesh.visible = false
        setMeshOpacity(mesh, 0)
      }
      for (const layer of layers) {
        layer.trace.visible = true
        layer.traceMat.uniforms.uProgress.value = drawEase
        layer.traceMat.uniforms.uPulse.value = 0
        layer.traceMat.uniforms.uTime.value = clock
        layer.traceMat.uniforms.uOpacity.value = enterEase
      }
      return
    }

    if (logoElapsed < fillEnd) {
      // 2) FILL — 3D fades in behind the finished outline
      const fillT = (logoElapsed - drawEnd) / INTRO.logoFillDur
      const fillEase = fillT * fillT * (3 - 2 * fillT)

      for (const mesh of meshes) {
        mesh.visible = true
        setMeshOpacity(mesh, fillEase)
      }
      for (const layer of layers) {
        layer.trace.visible = true
        layer.traceMat.uniforms.uProgress.value = 1
        layer.traceMat.uniforms.uPulse.value = THREE.MathUtils.smoothstep(fillEase, 0.2, 1)
        layer.traceMat.uniforms.uTime.value = clock
        layer.traceMat.uniforms.uOpacity.value = 1
      }
      return
    }

    // 3) HOLD — solid logo + soft pulsing outline + beam catch lights
    if (!done.current) {
      done.current = true
      root.current.scale.setScalar(1)
      for (const mesh of meshes) {
        mesh.visible = true
        setMeshOpacity(mesh, 1)
      }
    }

    const tilt = tiltRef?.current ?? { x: 0, y: 0 }
    const spin = spinRef?.current ?? 0
    applyBeamCatch(meshes, tilt.x, tilt.y, spin, clock)

    for (const layer of layers) {
      layer.trace.visible = true
      layer.traceMat.uniforms.uProgress.value = 1
      layer.traceMat.uniforms.uPulse.value = 1
      layer.traceMat.uniforms.uTime.value = clock
      // Outline brightens as the logo catches the beam
      const catchGlow =
        0.75 + Math.min(0.35, Math.hypot(tilt.x, tilt.y) * 0.55)
      layer.traceMat.uniforms.uOpacity.value = catchGlow
    }
  })

  return (
    <Center cacheKey={`rf-logo-${fittedScale.toFixed(3)}`}>
      <group ref={root}>
        <primitive object={model} scale={fittedScale} />
      </group>
    </Center>
  )
}

useGLTF.preload(MODEL_PATH, true)
