import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { ComingSoon } from './components/ComingSoon'
import { Footer } from './components/Footer'
import { SceneFallback } from './components/SceneFallback'
import { markPageStart, markSceneReady } from './introTimeline'
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion'

// Keep Three.js off the critical path — dark base first, scene fades in
const Scene = lazy(() =>
  import('./components/Scene').then((mod) => ({ default: mod.Scene })),
)

export default function App() {
  const reducedMotion = usePrefersReducedMotion()
  const [introLive, setIntroLive] = useState(false)

  useEffect(() => {
    if (!reducedMotion) return
    markPageStart()
    setIntroLive(true)
  }, [reducedMotion])

  const onSceneReady = useCallback(() => {
    markSceneReady()
    setIntroLive(true)
  }, [])

  return (
    <div className={`app${introLive ? ' app--intro' : ''}`}>
      {reducedMotion ? (
        <SceneFallback />
      ) : (
        <Suspense fallback={null}>
          <Scene onReady={onSceneReady} />
        </Suspense>
      )}
      <ComingSoon />
      <Footer />
    </div>
  )
}
