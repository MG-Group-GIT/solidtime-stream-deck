export const DEFAULT_RUNNING_COLOR = "#2f9e44";

/**
 * Returns the color if it is a valid "#rrggbb" value, otherwise the default running color.
 */
export function normalizeColor(color: string | undefined): string {
    return color && /^#[0-9a-f]{6}$/i.test(color.trim()) ? color.trim().toLowerCase() : DEFAULT_RUNNING_COLOR;
}

/**
 * Builds the key image for the "Running" state: the whole key is filled with the chosen color and the
 * stopwatch outline is drawn as a darker overlay so the white title stays readable on any color.
 */
export function runningKeyImage(color: string | undefined): string {
    const fill = normalizeColor(color);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144">
  <rect x="0" y="0" width="144" height="144" fill="${fill}"/>
  <g fill="#000" fill-opacity="0.28">
    <rect x="68" y="17" width="9" height="9"/>
    <rect x="65" y="5" width="15" height="15" rx=".7" ry=".7"/>
    <rect x="27.7" y="36.8" width="5.7" height="5.7" transform="translate(-19.1 33.2) rotate(-45)"/>
    <rect x="22.1" y="31.3" width="10.5" height="10.5" rx=".7" ry=".7" transform="translate(-17.8 30.1) rotate(-45)"/>
  </g>
  <circle cx="72" cy="82" r="55" fill="none" stroke="#000" stroke-opacity="0.28" stroke-width="5"/>
</svg>`;
}
