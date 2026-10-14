/** Window/content dimensions (logical px) shared by the UI and layout requests.
 *
 *  The native window is always a bit larger than the visible content: the extra
 *  space (`MARGIN`) gives shadows, glow rings and the hover/pop animations room
 *  to breathe instead of being clipped by the window bounds. It must match the
 *  `--halo-pad-x` / `--halo-pad-y` tokens in styles/tokens.css.
 */

export const CAPSULE = { w: 220, h: 46 };
export const PANEL = { w: 408, h: 548 };

/** Transparent padding around the content inside the window. */
export const MARGIN = { x: 18, y: 14 };

/** Extra capsule width/height while the island "wakes up" on hover. */
export const PREVIEW_GROWTH = { w: 16, h: 6 };
