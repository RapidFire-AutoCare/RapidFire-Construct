/** Shared platform radius — beam outer wall and pad top must match. */
export const PLATFORM_RADIUS = 1.12

/** Logo face diameter — smaller than the pad so the beam can frame it */
export const LOGO_FIT_DIAMETER = PLATFORM_RADIUS * 1.15

/**
 * World Y for the logo — centered in the dark beam pocket above the pad.
 * Beam group sits at y=-0.84; pad top ≈ -0.63; visible column mid ≈ 0.42.
 */
export const LOGO_HOVER_Y = 0.42
