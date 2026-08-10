import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { ContactShadows, Float } from '@react-three/drei'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { Suspense, useCallback, useEffect, useLayoutEffect, useState, useRef } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import type { Group } from 'three'
import { INTRO, easeCamera, msUntil, segmentProgress, smoothstep01 } from '../introTimeline'
import { LevitationBeam } from './LevitationBeam'
import { LogoPedestal } from './LogoPedestal'
import { LOGO_FIT_DIAMETER, LOGO_HOVER_Y } from './platform'
import { RFLogo } from './RFLogo'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'

type Pointer = { x: number; y: number }

const TWO_PI = Math.PI * 2

const CAM_HOME = new THREE.Vector3(0, 0.22, 6.35)
const LOOK_HOME = new THREE.Vector3(0, -0.05, 0)

/** B-roll start — low/wide beside the pedestal */
const CAM_START_AZ = -1.22
const CAM_START_RADIUS = 8.6
const CAM_START_Y = -0.28
const CAM_START_FOV = 40
const CAM_HOME_FOV = 34
const LOOK_START = new THREE.Vector3(0.12, -0.55, 0)

/** Scales follow snappiness, drag throw, spin boost, and settle momentum */
const INTERACTIVITY = 1.35

const FOLLOW_TILT_X = 0.42
const FOLLOW_TILT_Y = 0.7
const DRAG_THRESHOLD_PX = 7
const DRAG_SENSITIVITY = 0.012 * INTERACTIVITY
const FOLLOW_DAMP = 5.5 * INTERACTIVITY
const RETURN_DAMP = 3.2 * INTERACTIVITY
const VELOCITY_DECAY = 3.8 / INTERACTIVITY

/** Click spin — speed multiplier (not a queue) */
const MAX_SPIN_MULT = 5
const BASE_SPIN_RAD_PER_SEC = TWO_PI * 1.25 * INTERACTIVITY
const SPIN_IDLE_MS = 420
const SPIN_MULT_DECAY_PER_SEC = 2.8
const SPIN_SETTLE_DAMP = 7

function usePointer() {
  const pointer = useRef<Pointer>({ x: 0, y: 0 })

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const w = window.innerWidth || 1
      const h = window.innerHeight || 1
      pointer.current.x = (event.clientX / w) * 2 - 1
      pointer.current.y = -((event.clientY / h) * 2 - 1)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  return pointer
}

/**
 * Page-load b-roll: low/wide side orbit → front hero push-in,
 * then lock to CAM_HOME (no mouse pan).
 */
function IntroCamera({ reducedMotion }: { reducedMotion: boolean }) {
  const { camera } = useThree()
  const pos = useRef(new THREE.Vector3())
  const look = useRef(new THREE.Vector3())
  const settled = useRef(reducedMotion)
  /** Local clock — always plays the full b-roll once the Canvas is alive */
  const localStartedAt = useRef(-1)

  useEffect(() => {
    if (reducedMotion) {
      camera.position.copy(CAM_HOME)
      camera.lookAt(LOOK_HOME)
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = CAM_HOME_FOV
        camera.updateProjectionMatrix()
      }
      settled.current = true
      return
    }

    // Seed start pose immediately so the first frame isn't the hero shot
    const x = Math.sin(CAM_START_AZ) * CAM_START_RADIUS
    const z = Math.cos(CAM_START_AZ) * CAM_START_RADIUS
    camera.position.set(x, CAM_START_Y, z)
    camera.lookAt(LOOK_START)
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = CAM_START_FOV
      camera.updateProjectionMatrix()
    }
    settled.current = false
    localStartedAt.current = -1
  }, [camera, reducedMotion])

  useFrame(() => {
    if (reducedMotion || settled.current) {
      camera.position.copy(CAM_HOME)
      camera.lookAt(LOOK_HOME)
      return
    }

    if (localStartedAt.current < 0) {
      localStartedAt.current = performance.now()
    }

    // Local clock guarantees the full orbit even if the page clock raced ahead
    const localElapsed = (performance.now() - localStartedAt.current) / 1000
    const t = THREE.MathUtils.clamp(
      (localElapsed - INTRO.cameraAt) / Math.max(INTRO.cameraDur, 0.0001),
      0,
      1,
    )
    const e = easeCamera(t)

    // Azimuth arcs from the side toward front (0)
    const az = THREE.MathUtils.lerp(CAM_START_AZ, 0, e)
    // Radius pushes in toward hero distance
    const radius = THREE.MathUtils.lerp(CAM_START_RADIUS, CAM_HOME.z, e)
    // Height: low → slight crest mid-arc → hero
    const crest = 0.55
    const y =
      e < 0.55
        ? THREE.MathUtils.lerp(CAM_START_Y, crest, e / 0.55)
        : THREE.MathUtils.lerp(crest, CAM_HOME.y, (e - 0.55) / 0.45)

    pos.current.set(Math.sin(az) * radius, y, Math.cos(az) * radius)

    // Look climbs from the plinth rim up to the floating logo
    look.current.lerpVectors(LOOK_START, LOOK_HOME, e)

    camera.position.copy(pos.current)
    camera.lookAt(look.current)

    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = THREE.MathUtils.lerp(CAM_START_FOV, CAM_HOME_FOV, e)
      camera.updateProjectionMatrix()
    }

    if (t >= 1) {
      settled.current = true
      camera.position.copy(CAM_HOME)
      camera.lookAt(LOOK_HOME)
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = CAM_HOME_FOV
        camera.updateProjectionMatrix()
      }
    }
  })

  return null
}

/** Procedural studio env — intensity animated by intro timeline */
function LocalEnvironment({ reducedMotion }: { reducedMotion: boolean }) {
  const { gl, scene } = useThree()
  const targetIntensity = 0.75

  useEffect(() => {
    let cancelled = false
    let rt: THREE.WebGLRenderTarget | null = null

    const id = window.requestAnimationFrame(() => {
      if (cancelled) return
      const pmrem = new THREE.PMREMGenerator(gl)
      const env = new RoomEnvironment()
      rt = pmrem.fromScene(env, 0.04)
      scene.environment = rt.texture
      scene.environmentIntensity = reducedMotion ? targetIntensity : 0
      env.dispose()
      pmrem.dispose()
    })

    return () => {
      cancelled = true
      window.cancelAnimationFrame(id)
      if (rt && scene.environment === rt.texture) scene.environment = null
      rt?.dispose()
    }
  }, [gl, scene, reducedMotion])

  useFrame(() => {
    if (reducedMotion || !scene.environment) return
    const t = smoothstep01(segmentProgress(INTRO.lightsAt, INTRO.lightsDur))
    scene.environmentIntensity = targetIntensity * t
  })

  return null
}

function IntroLights({ reducedMotion }: { reducedMotion: boolean }) {
  const ambient = useRef<THREE.AmbientLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const key = useRef<THREE.DirectionalLight>(null)
  const fill = useRef<THREE.DirectionalLight>(null)
  const spot = useRef<THREE.SpotLight>(null)

  useFrame(() => {
    const t = reducedMotion
      ? 1
      : smoothstep01(segmentProgress(INTRO.lightsAt, INTRO.lightsDur))

    if (ambient.current) ambient.current.intensity = 0.4 * t
    if (hemi.current) hemi.current.intensity = 0.6 * t
    if (key.current) key.current.intensity = 1.7 * t
    if (fill.current) fill.current.intensity = 0.5 * t
    if (spot.current) spot.current.intensity = 14 * t
  })

  return (
    <>
      <ambientLight ref={ambient} intensity={0} />
      <hemisphereLight ref={hemi} args={['#ffd8b5', '#0b0e14', 0]} />
      <directionalLight
        ref={key}
        position={[3.2, 4.8, 3.5]}
        intensity={0}
        color="#fff7f0"
      />
      <directionalLight
        ref={fill}
        position={[-3.5, 1.2, -2]}
        intensity={0}
        color="#7ea0ff"
      />
      <spotLight
        ref={spot}
        position={[1.2, 3.8, 3]}
        angle={0.42}
        penumbra={0.8}
        intensity={0}
        color="#ff6a1a"
        distance={12}
        decay={2}
      />
    </>
  )
}

/**
 * Logo interactions:
 * - Follows cursor with momentum
 * - Click / tap → spin speed multiplier (caps, decays when idle)
 * - Press + drag → rotate on axis; release coasts then returns to follow
 */
function LogoRig({ reducedMotion }: { reducedMotion: boolean }) {
  const followGroup = useRef<Group>(null)
  const spinGroup = useRef<Group>(null)
  const pointer = usePointer()
  const { gl } = useThree()

  const interactive = useRef(reducedMotion)
  const [floatOn, setFloatOn] = useState(reducedMotion)
  const [hovered, setHovered] = useState(false)

  const spinMult = useRef(0)
  const spinAngle = useRef(0)
  const lastSpinInputAt = useRef(0)
  const bumpedThisPress = useRef(false)
  const tiltRef = useRef({ x: 0, y: 0 })
  const spinRef = useRef(0)

  const beamUp = useRef<THREE.SpotLight>(null)
  const beamTarget = useRef<THREE.Object3D>(null)
  const beamFill = useRef<THREE.PointLight>(null)
  const glintA = useRef<THREE.PointLight>(null)
  const glintB = useRef<THREE.PointLight>(null)

  useEffect(() => {
    if (beamUp.current && beamTarget.current) {
      beamUp.current.target = beamTarget.current
    }
  }, [])

  const pressing = useRef(false)
  const dragging = useRef(false)
  const dragMoved = useRef(false)
  const pointerId = useRef<number | null>(null)
  const pressOrigin = useRef({ x: 0, y: 0 })
  const lastClient = useRef({ x: 0, y: 0, t: 0 })
  const dragOffset = useRef({ x: 0, y: 0 })
  const dragBase = useRef({ x: 0, y: 0 })
  const velocity = useRef({ x: 0, y: 0 })

  const bumpSpin = useCallback(() => {
    spinMult.current = Math.min(MAX_SPIN_MULT, spinMult.current + 1)
    lastSpinInputAt.current = performance.now()
  }, [])

  useEffect(() => {
    if (reducedMotion) {
      interactive.current = true
      setFloatOn(true)
      return
    }
    // Hold interaction until the b-roll camera settles into the hero shot
    const interactId = window.setTimeout(() => {
      interactive.current = true
    }, msUntil(INTRO.extrasAt))
    const floatId = window.setTimeout(() => {
      setFloatOn(true)
    }, msUntil(INTRO.extrasAt))
    return () => {
      window.clearTimeout(interactId)
      window.clearTimeout(floatId)
    }
  }, [reducedMotion])

  useEffect(() => {
    gl.domElement.style.cursor = hovered || pressing.current ? 'grab' : 'default'
    return () => {
      gl.domElement.style.cursor = 'default'
    }
  }, [gl, hovered])

  const endPress = useCallback(
    (event: PointerEvent) => {
      if (pointerId.current !== null && event.pointerId !== pointerId.current) return

      const wasDragging = dragging.current

      pressing.current = false
      dragging.current = false
      pointerId.current = null
      bumpedThisPress.current = false
      gl.domElement.style.cursor = hovered ? 'grab' : 'default'

      try {
        gl.domElement.releasePointerCapture(event.pointerId)
      } catch {
        /* already released */
      }

      if (!interactive.current || reducedMotion) return

      if (wasDragging) {
        velocity.current.x *= INTERACTIVITY
        velocity.current.y *= INTERACTIVITY
      }
    },
    [gl, hovered, reducedMotion],
  )

  useEffect(() => {
    const el = gl.domElement

    const onMove = (event: PointerEvent) => {
      if (!pressing.current || pointerId.current !== event.pointerId) return

      const dx = event.clientX - pressOrigin.current.x
      const dy = event.clientY - pressOrigin.current.y
      if (!dragging.current) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
        dragging.current = true
        dragMoved.current = true
        el.style.cursor = 'grabbing'
        // Cancel the tap spin boost — this press is a drag
        if (bumpedThisPress.current) {
          spinMult.current = Math.max(0, spinMult.current - 1)
          bumpedThisPress.current = false
        }
        if (followGroup.current) {
          dragBase.current = {
            x: followGroup.current.rotation.x,
            y: followGroup.current.rotation.y,
          }
          dragOffset.current = { x: 0, y: 0 }
        }
      }

      const now = performance.now()
      const dt = Math.max((now - lastClient.current.t) / 1000, 1 / 120)
      const moveX = event.clientX - lastClient.current.x
      const moveY = event.clientY - lastClient.current.y

      dragOffset.current.y += moveX * DRAG_SENSITIVITY
      dragOffset.current.x += moveY * DRAG_SENSITIVITY

      const vx = THREE.MathUtils.clamp((moveX * DRAG_SENSITIVITY) / dt, -8, 8)
      const vy = THREE.MathUtils.clamp((moveY * DRAG_SENSITIVITY) / dt, -8, 8)
      velocity.current.y = vx
      velocity.current.x = vy

      lastClient.current = { x: event.clientX, y: event.clientY, t: now }
    }

    const onUp = (event: PointerEvent) => endPress(event)
    const onCancel = (event: PointerEvent) => endPress(event)

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancel)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onCancel)
    }
  }, [endPress, gl])

  const onPointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation()
      if (!interactive.current || reducedMotion) return

      const e = event.nativeEvent
      pressing.current = true
      dragging.current = false
      dragMoved.current = false
      pointerId.current = e.pointerId
      pressOrigin.current = { x: e.clientX, y: e.clientY }
      lastClient.current = { x: e.clientX, y: e.clientY, t: performance.now() }
      velocity.current = { x: 0, y: 0 }
      gl.domElement.style.cursor = 'grabbing'

      // Instant spin boost on press — visible the same frame (undone if this becomes a drag)
      bumpSpin()
      bumpedThisPress.current = true

      try {
        gl.domElement.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    },
    [bumpSpin, gl, reducedMotion],
  )

  useFrame((state, delta) => {
    if (!followGroup.current || !spinGroup.current) return

    const dt = Math.min(delta, 1 / 30)

    if (!reducedMotion) {
      const enter = smoothstep01(segmentProgress(INTRO.logoDrawAt, 0.55))
      followGroup.current.position.y = THREE.MathUtils.lerp(
        LOGO_HOVER_Y - 0.35,
        LOGO_HOVER_Y,
        enter,
      )
    } else {
      followGroup.current.position.y = LOGO_HOVER_Y
    }

    const live = interactive.current && !reducedMotion
    const followX = live ? -pointer.current.y * FOLLOW_TILT_X : 0
    const followY =
      live
        ? pointer.current.x * FOLLOW_TILT_Y +
          (floatOn ? Math.sin(state.clock.elapsedTime * 0.3) * 0.03 : 0)
        : 0

    if (dragging.current) {
      followGroup.current.rotation.x = dragBase.current.x + dragOffset.current.x
      followGroup.current.rotation.y = dragBase.current.y + dragOffset.current.y
    } else {
      dragOffset.current.x += velocity.current.x * dt
      dragOffset.current.y += velocity.current.y * dt
      velocity.current.x = THREE.MathUtils.damp(velocity.current.x, 0, VELOCITY_DECAY, dt)
      velocity.current.y = THREE.MathUtils.damp(velocity.current.y, 0, VELOCITY_DECAY, dt)
      dragOffset.current.x = THREE.MathUtils.damp(dragOffset.current.x, 0, RETURN_DAMP, dt)
      dragOffset.current.y = THREE.MathUtils.damp(dragOffset.current.y, 0, RETURN_DAMP, dt)

      const targetX = followX + dragOffset.current.x
      const targetY = followY + dragOffset.current.y
      followGroup.current.rotation.x = THREE.MathUtils.damp(
        followGroup.current.rotation.x,
        targetX,
        FOLLOW_DAMP,
        dt,
      )
      followGroup.current.rotation.y = THREE.MathUtils.damp(
        followGroup.current.rotation.y,
        targetY,
        FOLLOW_DAMP,
        dt,
      )
    }

    // Continuous spin from click speed multiplier
    const idleMs = performance.now() - lastSpinInputAt.current
    if (spinMult.current > 0 && idleMs > SPIN_IDLE_MS) {
      spinMult.current = Math.max(0, spinMult.current - SPIN_MULT_DECAY_PER_SEC * dt)
    }

    if (spinMult.current > 0.05) {
      spinAngle.current += BASE_SPIN_RAD_PER_SEC * spinMult.current * dt
      spinGroup.current.rotation.y = spinAngle.current
    } else {
      spinMult.current = 0
      // Ease back to the follow-facing pose (0 yaw on the spin layer)
      let a = ((spinAngle.current % TWO_PI) + TWO_PI) % TWO_PI
      if (a > Math.PI) {
        a = THREE.MathUtils.damp(a, TWO_PI, SPIN_SETTLE_DAMP, dt)
        if (a > TWO_PI - 0.03) a = 0
      } else {
        a = THREE.MathUtils.damp(a, 0, SPIN_SETTLE_DAMP, dt)
        if (a < 0.03) a = 0
      }
      spinAngle.current = a
      spinGroup.current.rotation.y = a
    }

    // Publish pose for RFLogo beam-catch materials
    tiltRef.current.x = followGroup.current.rotation.x
    tiltRef.current.y = followGroup.current.rotation.y
    spinRef.current = spinGroup.current.rotation.y

    // World-stable beam lights + glints that sweep opposite the follow tilt
    const rx = followGroup.current.rotation.x
    const ry = followGroup.current.rotation.y
    const spinBoost = 1 + Math.min(1.5, spinMult.current * 0.22)

    if (beamUp.current) {
      // Keep the catch focused on the logo — bright enough to bloom, not wash the pocket
      beamUp.current.intensity = 22 * spinBoost
      beamUp.current.position.set(
        Math.sin(ry) * 0.12,
        LOGO_HOVER_Y - 1.05,
        0.05 + Math.cos(ry) * 0.08,
      )
    }
    if (beamTarget.current) {
      beamTarget.current.position.set(
        Math.sin(ry) * 0.55,
        LOGO_HOVER_Y + 0.2 - rx * 0.35,
        0.15 + Math.cos(ry) * 0.3,
      )
    }
    if (beamFill.current) {
      beamFill.current.intensity = 2.4 * spinBoost
      beamFill.current.position.set(
        Math.sin(ry) * 0.2,
        LOGO_HOVER_Y - 0.65,
        Math.cos(ry) * 0.15,
      )
    }
    if (glintA.current) {
      // Specular catch-light orbits against the logo tilt (reads as refraction/reflection)
      glintA.current.position.set(
        -Math.sin(ry) * 1.05 + Math.sin(state.clock.elapsedTime * 1.1) * 0.1,
        LOGO_HOVER_Y + 0.3 - rx * 0.7,
        0.9 + Math.cos(ry) * 0.4,
      )
      glintA.current.intensity = (3.2 + Math.abs(ry) * 4.2 + Math.abs(rx) * 2.8) * spinBoost
    }
    if (glintB.current) {
      glintB.current.position.set(
        Math.sin(ry + 1.1) * 0.9,
        LOGO_HOVER_Y - 0.05 + rx * 0.5,
        0.6 + Math.cos(ry + 1.1) * 0.35,
      )
      glintB.current.intensity = (2.1 + Math.abs(rx) * 3.1 + Math.abs(ry) * 1.4) * spinBoost
    }
  })

  return (
    <>
      {/* Beam catch-lights — fixed in world space so speculars slide as the logo tilts */}
      <spotLight
        ref={beamUp}
        color="#ff7a2a"
        position={[0, LOGO_HOVER_Y - 1.05, 0.05]}
        angle={0.62}
        penumbra={0.75}
        intensity={0}
        distance={4.5}
        decay={2}
      />
      <object3D ref={beamTarget} position={[0, LOGO_HOVER_Y + 0.15, 0.2]} />
      <pointLight
        ref={beamFill}
        color="#ff4500"
        position={[0, LOGO_HOVER_Y - 0.7, 0]}
        intensity={0}
        distance={2.8}
        decay={2}
      />
      <pointLight
        ref={glintA}
        color="#ffe4c8"
        position={[0.5, LOGO_HOVER_Y + 0.2, 0.9]}
        intensity={0}
        distance={2.4}
        decay={2}
      />
      <pointLight
        ref={glintB}
        color="#ff9a55"
        position={[-0.45, LOGO_HOVER_Y - 0.05, 0.7]}
        intensity={0}
        distance={2.2}
        decay={2}
      />

      <group ref={followGroup} position={[0, LOGO_HOVER_Y, 0]}>
        <Float
          speed={floatOn ? 0.7 : 0}
          rotationIntensity={0}
          floatIntensity={floatOn ? 0.12 : 0}
        >
          <group
            ref={spinGroup}
            onPointerDown={onPointerDown}
            onPointerOver={(e) => {
              e.stopPropagation()
              setHovered(true)
            }}
            onPointerOut={() => setHovered(false)}
          >
            <RFLogo
              fitDiameter={LOGO_FIT_DIAMETER}
              reducedMotion={reducedMotion}
              tiltRef={tiltRef}
              spinRef={spinRef}
            />
          </group>
        </Float>
      </group>
    </>
  )
}

function ShadowLayer({ reducedMotion }: { reducedMotion: boolean }) {
  const [on, setOn] = useState(reducedMotion)

  useEffect(() => {
    if (reducedMotion) return
    const id = window.setTimeout(() => setOn(true), msUntil(INTRO.shadowAt))
    return () => window.clearTimeout(id)
  }, [reducedMotion])

  if (!on) return null

  return (
    <ContactShadows
      position={[0, -0.95, 0]}
      opacity={0.55}
      scale={5.5}
      blur={2.6}
      far={3.2}
      color="#000000"
      frames={1}
    />
  )
}

function BloomLayer({ reducedMotion }: { reducedMotion: boolean }) {
  const [on, setOn] = useState(reducedMotion)
  const bloomRef = useRef<{ intensity: number } | null>(null)

  useEffect(() => {
    if (reducedMotion) return
    const id = window.setTimeout(() => setOn(true), msUntil(INTRO.bloomAt))
    return () => window.clearTimeout(id)
  }, [reducedMotion])

  useFrame(() => {
    if (!bloomRef.current) return
    const t = reducedMotion
      ? 1
      : smoothstep01(segmentProgress(INTRO.bloomAt, INTRO.bloomDur))
    // Slight pulse with page clock so specular blooms feel alive with mouse catch-lights
    const pulse = 1 + Math.sin(performance.now() * 0.0018) * 0.06
    bloomRef.current.intensity = 0.62 * t * pulse
  })

  if (!on && !reducedMotion) return null

  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom
        ref={bloomRef as never}
        intensity={reducedMotion ? 0.62 : 0}
        luminanceThreshold={0.58}
        luminanceSmoothing={0.26}
        mipmapBlur
      />
    </EffectComposer>
  )
}

function SceneContents({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <>
      <IntroCamera reducedMotion={reducedMotion} />
      <IntroLights reducedMotion={reducedMotion} />
      <LocalEnvironment reducedMotion={reducedMotion} />

      <LogoPedestal reducedMotion={reducedMotion} />
      <LevitationBeam reducedMotion={reducedMotion} />

      <Suspense fallback={null}>
        <LogoRig reducedMotion={reducedMotion} />
      </Suspense>

      <ShadowLayer reducedMotion={reducedMotion} />
      <BloomLayer reducedMotion={reducedMotion} />
    </>
  )
}

export function Scene({ onReady }: { onReady?: () => void }) {
  const reducedMotion = usePrefersReducedMotion()
  const [ready, setReady] = useState(false)
  const notified = useRef(false)

  // Start intro clock before child effects schedule timeouts
  useLayoutEffect(() => {
    if (notified.current) return
    notified.current = true
    onReady?.()
  }, [onReady])

  return (
    <div className={`scene-root${ready ? ' scene-root--ready' : ''}`} aria-hidden>
      <Canvas
        dpr={[1, 1.5]}
        camera={{
          position: [
            Math.sin(CAM_START_AZ) * CAM_START_RADIUS,
            CAM_START_Y,
            Math.cos(CAM_START_AZ) * CAM_START_RADIUS,
          ],
          fov: CAM_START_FOV,
          near: 0.1,
          far: 40,
        }}
        gl={{
          antialias: true,
          alpha: true,
          premultipliedAlpha: false,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
        }}
        onCreated={({ gl, scene }) => {
          gl.setClearColor(0x000000, 0)
          scene.background = null
          requestAnimationFrame(() => setReady(true))
        }}
      >
        <SceneContents reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  )
}
