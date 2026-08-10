export function SceneFallback() {
  return (
    <div className="scene-fallback" aria-hidden>
      <img
        className="scene-fallback__logo"
        src={`${import.meta.env.BASE_URL}brand/logo-mark.png`}
        alt=""
        width={400}
        height={400}
        decoding="async"
      />
    </div>
  )
}
