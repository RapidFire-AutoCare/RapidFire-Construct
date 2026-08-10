/** WebKit (Safari / iOS) — different float RT + bloom behavior than Chromium */
export function isWebKit() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // Safari desktop/iOS; exclude Chromium-based "Safari" in UA strings
  return /AppleWebKit/i.test(ua) && !/Chrome|CriOS|Edg|Chromium|OPR|Firefox|FxiOS/i.test(ua)
}
