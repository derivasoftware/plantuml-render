/** Metrics, escaping and base stylesheet shared by the class and
 * sequence layouts — one source for the determinism contract.
 *
 * The stylesheet is written for inline embedding: every rule is scoped
 * under `.pr-diagram`, the tokens carry light values on the diagram and
 * dark values under `prefers-color-scheme: dark` and `[data-theme="dark"]`,
 * and nothing targets the host document (REQ-00012-1). */

export const CHAR_W = 8;
export const LINE_H = 18;
export const PAD = 10;

export const STYLE = `
  .pr-diagram { font-family: var(--pr-font, ui-monospace, monospace); font-size: 12px;
    --pr-text: #1c1c14; --pr-stroke: #3b3b33; --pr-box-fill: #fdfdf6; --pr-note-fill: #fbf6d9; --pr-container-fill: none; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .pr-diagram { --pr-text: #e8e8df; --pr-stroke: #b4b4a8; --pr-box-fill: #2b2b27; --pr-note-fill: #3d3922; } }
  [data-theme="dark"] .pr-diagram { --pr-text: #e8e8df; --pr-stroke: #b4b4a8; --pr-box-fill: #2b2b27; --pr-note-fill: #3d3922; }
  .pr-diagram text { fill: var(--pr-text); }
  .pr-diagram .pr-box rect { fill: var(--pr-box-fill); stroke: var(--pr-stroke); }
  .pr-diagram .pr-container > rect { fill: var(--pr-container-fill); stroke: var(--pr-stroke); stroke-dasharray: none; }
  .pr-diagram .pr-note rect { fill: var(--pr-note-fill); stroke: var(--pr-stroke); }
  .pr-diagram .pr-header { font-weight: 600; }
  .pr-diagram .pr-abstract .pr-header { font-style: italic; }
  .pr-diagram .pr-sep { stroke: var(--pr-stroke); }
  .pr-diagram .pr-edge { stroke: var(--pr-stroke); fill: none; }
  .pr-diagram .pr-edge-realization, .pr-diagram .pr-edge-dependency, .pr-diagram .pr-edge-attachment { stroke-dasharray: 6 4; }
  .pr-diagram marker path { fill: var(--pr-box-fill); stroke: var(--pr-stroke); }
  .pr-diagram marker .pr-filled { fill: var(--pr-stroke); }
  .pr-diagram marker .pr-open { fill: none; }
`;

export function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Per-diagram id prefix (REQ-00012-1): several SVGs share one HTML
 * document, so marker and node ids are prefixed with a deterministic hash
 * of the title (FNV-1a) while the logical id stays in `data-id`. */
export function idPrefix(title: string | undefined): string {
  let h = 0x811c9dc5;
  for (const ch of title ?? "") {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `pr${h.toString(36)}-`;
}

/** Root attributes shared by both layouts: natural size for `<img>` and
 * standalone use, fluid inside a container (REQ-00012-1). */
export function svgRoot(minX: number, minY: number, width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}" style="max-width:100%;height:auto" class="pr-diagram" role="img">`;
}
