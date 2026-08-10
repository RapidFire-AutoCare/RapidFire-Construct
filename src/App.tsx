import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { ComingSoon } from './components/ComingSoon'
import { Footer } from './components/Footer'
import { SceneErrorBoundary } from './components/SceneErrorBoundary'
import { SceneFallback } from './components/SceneFallback'
import { markPageStart, markSceneReady } from './introTimeline'
import { preloadLogoAssets } from './lib/preloadLogoAssets'
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion'

// Keep Three.js off the critical path — dark base first, scene fades in
const Scene = lazy(() =>
  import('./components/Scene').then((mod) => ({ default: mod.Scene })),
)

export default function App() {
  const reducedMotion = usePrefersReducedMotion()
  const [introLive, setIntroLive] = useState(false)
  const [assetsReady, setAssetsReady] = useState(false)

  useEffect(() => {
    if (reducedMotion) {
      markPageStart()
      setIntroLive(true)
      setAssetsReady(true)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        // Warm Scene chunk + Draco/GLB before Canvas mounts so the intro
        // clock cannot outrun the first paintable logo frame.
        await Promise.all([preloadLogoAssets(), import('./components/Scene')])
      } catch (err) {
        console.warn('[boot] asset preload failed; mounting scene anyway', err)
      } finally {
        if (!cancelled) setAssetsReady(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [reducedMotion])

  const onSceneReady = useCallback(() => {
    markSceneReady()
    setIntroLive(true)
  }, [])

  return (
    <div className={`app${introLive ? ' app--intro' : ''}`}>
      {reducedMotion ? (
        <SceneFallback />
      ) : assetsReady ? (
        <SceneErrorBoundary>
          <Suspense fallback={null}>
            <Scene onReady={onSceneReady} />
          </Suspense>
        </SceneErrorBoundary>
      ) : null}
      <ComingSoon />
      <Footer />
    </div>
  )
}
