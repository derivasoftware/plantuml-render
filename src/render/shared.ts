/** Metrics, escaping and base stylesheet shared by the class and
 * sequence layouts — one source for the determinism contract. */

export const CHAR_W = 8;
export const LINE_H = 18;
export const PAD = 10;

export const STYLE = `
  :root { color-scheme: light dark; }
  .pr-diagram { font-family: var(--pr-font, ui-monospace, monospace); font-size: 12px; }
  .pr-box rect { fill: var(--pr-box-fill, #fdfdf6); stroke: var(--pr-stroke, #3b3b33); }
  .pr-container > rect { fill: var(--pr-container-fill, none); stroke: var(--pr-stroke, #3b3b33); stroke-dasharray: none; }
  .pr-note rect { fill: var(--pr-note-fill, #fbf6d9); stroke: var(--pr-stroke, #3b3b33); }
  text { fill: var(--pr-text, #1c1c14); }
  .pr-header { font-weight: 600; }
  .pr-abstract .pr-header { font-style: italic; }
  .pr-sep { stroke: var(--pr-stroke, #3b3b33); }
  .pr-edge { stroke: var(--pr-stroke, #3b3b33); fill: none; }
  .pr-edge-realization, .pr-edge-dependency, .pr-edge-attachment { stroke-dasharray: 6 4; }
`;

export function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
