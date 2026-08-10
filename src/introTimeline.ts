/**
 * Sequential page-load reveal.
 * Times are seconds from markPageStart() (main.tsx).
 *
 * Order:
 *  1. Lights + pedestal
 *  2. B-roll camera (orbit + push-in) while beam ignites / logo draws
 *  3. Camera settles on hero framing — logo floating above platform
 *  4. Bloom / shadow polish
 *  5. Title → copy → footer
 *  6. Interaction unlock
 *
 * Keep CSS vars in src/styles/tokens.css in sync for DOM copy.
 */
export const INTRO = {
  /** 1 — Lights / environment ramp */
  lightsAt: 0.05,
  lightsDur: 0.5,

  /** Pedestal rises before the camera starts moving */
  pedestalAt: 0.08,
  pedestalDur: 0.65,

  /** Tractor beam ignites as the orbit begins */
  beamAt: 0.25,
  beamDur: 0.95,

  /**
   * 2 — Cinematic camera: low/wide side orbit → front hero push-in
   * Brief hold on the start pose so pedestal/beam are visible first.
   * Ends at CAM_HOME / LOOK_HOME in Scene.tsx
   */
  cameraAt: 0.4,
  cameraDur: 3.5,

  /** Logo outline draws during the arc */
  logoDrawAt: 0.55,
  logoDrawDur: 1.3,

  /** Solid logo fades in behind outline */
  logoFillDur: 0.55,

  /** Bloom during the late push-in */
  bloomAt: 2.6,
  bloomDur: 0.5,

  /** Ground contact shadow as we settle */
  shadowAt: 3.4,
  shadowDur: 0.35,

  /** 5 — DOM copy stack (after hero settle) */
  titleAt: 4.15,
  copyAt: 4.35,
  footerAt: 4.55,
  uiDur: 0.45,

  /** 6 — Float + pointer interactivity */
  extrasAt: 4.75,
} as const

export const logoFillAt = INTRO.logoDrawAt + INTRO.logoDrawDur

/** Camera path complete — hero framing locked */
export const cameraSettleAt = INTRO.cameraAt + INTRO.cameraDur

let pageStartMs = 0

/**
 * Intro clock origin. Prefer markSceneReady() so the b-roll isn't
 * skipped while the lazy Canvas chunk is still loading.
 */
export function markPageStart() {
  if (!pageStartMs) pageStartMs = performance.now()
}

/** Call when the WebGL scene can actually render the cinematic intro */
export function markSceneReady() {
  pageStartMs = performance.now()
}

export function pageElapsedSec() {
  if (!pageStartMs) return 0
  return Math.max(0, (performance.now() - pageStartMs) / 1000)
}

export function msUntil(atSec: number) {
  if (!pageStartMs) return atSec * 1000
  return Math.max(0, atSec * 1000 - (performance.now() - pageStartMs))
}

/** Smooth 0–1 progress for a timed segment on the page clock */
export function segmentProgress(at: number, dur: number) {
  return THREE_clamp((pageElapsedSec() - at) / Math.max(dur, 0.0001), 0, 1)
}

function THREE_clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

export function smoothstep01(t: number) {
  const x = THREE_clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

/** Cinematic ease — soft accel, long cruise, soft settle */
export function easeCamera(t: number) {
  const x = THREE_clamp(t, 0, 1)
  // Quintic smoothstep variant
  return x * x * x * (x * (x * 6 - 15) + 10)
}
