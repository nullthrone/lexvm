/**
 * The LexVM mark: an open book on sepia paper with a prompt chevron "›" on the
 * right-hand page. One source for every icon variant.
 */

export type IconVariant = "any" | "maskable" | "apple";

const PAPER = "#f3ead7";
const PAGE = "#fcf8ee";
const INK = "#3a2f25";
const ACCENT = "#8a2e1c";

function mark(): string {
  return [
    `<path d="M256 174C214 148 160 140 104 148V358C160 350 214 358 256 384Z" fill="${PAGE}" stroke="${INK}" stroke-width="16" stroke-linejoin="round"/>`,
    `<path d="M256 174C298 148 352 140 408 148V358C352 350 298 358 256 384Z" fill="${PAGE}" stroke="${INK}" stroke-width="16" stroke-linejoin="round"/>`,
    `<g fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round" opacity="0.5">`,
    `<path d="M138 206C168 202 196 206 222 216"/>`,
    `<path d="M138 246C168 242 196 246 222 256"/>`,
    `<path d="M138 286C162 283 184 286 204 292"/>`,
    "</g>",
    `<path d="M300 212L350 256L300 300" fill="none" stroke="${ACCENT}" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>`,
  ].join("");
}

/** SVG source (512×512) for an icon variant. */
export function iconSvg(variant: IconVariant): string {
  // "any": rounded square with transparent corners. "maskable"/"apple": full-bleed background,
  // mark scaled into the safe zone (maskable: 80% circle).
  const background =
    variant === "any"
      ? `<rect width="512" height="512" rx="112" fill="${PAPER}"/>`
      : `<rect width="512" height="512" fill="${PAPER}"/>`;
  const scale = variant === "maskable" ? 0.78 : variant === "apple" ? 0.88 : 1;
  // The mark's optical centre is at (256, 266); move it to the canvas centre and scale around it.
  const transform = `translate(256 256) scale(${scale}) translate(-256 -266)`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">`,
    `<title>LexVM</title>`,
    background,
    `<g transform="${transform}">${mark()}</g>`,
    "</svg>",
    "",
  ].join("\n");
}
