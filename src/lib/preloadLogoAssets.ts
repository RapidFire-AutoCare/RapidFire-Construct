import { DRACO_PATH, MODEL_PATH } from '../brand'

let preloadPromise: Promise<void> | null = null

async function warm(url: string) {
  const res = await fetch(url, { mode: 'cors', credentials: 'same-origin' })
  if (!res.ok) throw new Error(`Failed to warm ${url}: ${res.status}`)
  // Drain the body so the response is fully cached
  await res.arrayBuffer()
}

/**
 * Warm network caches for the logo GLB + Draco decoder before Canvas mounts.
 * Decoding still happens via drei/useGLTF — this only prevents cold-load races
 * where the intro clock starts before bytes are available.
 */
export function preloadLogoAssets() {
  if (preloadPromise) return preloadPromise

  preloadPromise = (async () => {
    try {
      await Promise.all([
        warm(MODEL_PATH),
        warm(`${DRACO_PATH}draco_wasm_wrapper.js`),
        warm(`${DRACO_PATH}draco_decoder.wasm`),
      ])
    } catch (err) {
      preloadPromise = null
      throw err
    }
  })()

  return preloadPromise
}
