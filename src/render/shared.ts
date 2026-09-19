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
  .pr-diagram { font-family: var(--pr-font, "JetBrains Mono", "Cascadia Code", "SFMono-Regular", Menlo, Consolas, ui-monospace, monospace); font-size: 12px;
    --pr-text: #1e293b; --pr-muted: #64748b; --pr-stroke: #94a3b8; --pr-edge: #64748b; --pr-box-fill: #ffffff; --pr-container-fill: #f8fafc; --pr-container-stroke: #cbd5e1;
    --pr-note-fill: #fffbeb; --pr-note-stroke: #fcd34d; --pr-head-class: #eef2ff; --pr-head-interface: #ecfdf5; --pr-head-enum: #fff7ed; --pr-head-function: #f1f5f9; --pr-head-abstract: #f5f3ff;
    --pr-badge-class: #4f46e5; --pr-badge-interface: #059669; --pr-badge-enum: #d97706; --pr-badge-function: #475569; --pr-badge-abstract: #7c3aed;
    --pr-name: #0f172a; --pr-type: #2563eb; --pr-param: #475569; --pr-punct: #94a3b8;
    --pr-vis-public: #16a34a; --pr-vis-private: #dc2626; --pr-vis-protected: #d97706; --pr-vis-package: #2563eb; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .pr-diagram { --pr-text: #e2e8f0; --pr-muted: #94a3b8; --pr-stroke: #475569; --pr-edge: #94a3b8; --pr-box-fill: #1e293b; --pr-container-fill: #0f172a; --pr-container-stroke: #334155;
    --pr-note-fill: #3b3418; --pr-note-stroke: #a16207; --pr-head-class: #312e81; --pr-head-interface: #064e3b; --pr-head-enum: #78350f; --pr-head-function: #334155; --pr-head-abstract: #4c1d95;
    --pr-badge-class: #a5b4fc; --pr-badge-interface: #6ee7b7; --pr-badge-enum: #fcd34d; --pr-badge-function: #cbd5e1; --pr-badge-abstract: #c4b5fd;
    --pr-name: #f8fafc; --pr-type: #7dd3fc; --pr-param: #cbd5e1; --pr-punct: #64748b; --pr-vis-public: #4ade80; --pr-vis-private: #f87171; --pr-vis-protected: #fbbf24; --pr-vis-package: #60a5fa; } }
  [data-theme="dark"] .pr-diagram { --pr-text: #e2e8f0; --pr-muted: #94a3b8; --pr-stroke: #475569; --pr-edge: #94a3b8; --pr-box-fill: #1e293b; --pr-container-fill: #0f172a; --pr-container-stroke: #334155;
    --pr-note-fill: #3b3418; --pr-note-stroke: #a16207; --pr-head-class: #312e81; --pr-head-interface: #064e3b; --pr-head-enum: #78350f; --pr-head-function: #334155; --pr-head-abstract: #4c1d95;
    --pr-badge-class: #a5b4fc; --pr-badge-interface: #6ee7b7; --pr-badge-enum: #fcd34d; --pr-badge-function: #cbd5e1; --pr-badge-abstract: #c4b5fd;
    --pr-name: #f8fafc; --pr-type: #7dd3fc; --pr-param: #cbd5e1; --pr-punct: #64748b; --pr-vis-public: #4ade80; --pr-vis-private: #f87171; --pr-vis-protected: #fbbf24; --pr-vis-package: #60a5fa; }
  .pr-diagram text { fill: var(--pr-text); }
  .pr-diagram rect, .pr-diagram line.pr-sep { shape-rendering: crispEdges; }
  .pr-diagram .pr-box > rect { fill: var(--pr-box-fill); stroke: var(--pr-stroke); }
  .pr-diagram .pr-head { fill: var(--pr-head-class); stroke: none; }
  .pr-diagram .pr-classifier-interface .pr-head { fill: var(--pr-head-interface); }
  .pr-diagram .pr-classifier-enum .pr-head { fill: var(--pr-head-enum); }
  .pr-diagram .pr-classifier-function .pr-head, .pr-diagram .pr-stereotype-function .pr-head { fill: var(--pr-head-function); }
  .pr-diagram .pr-abstract .pr-head { fill: var(--pr-head-abstract); }
  .pr-diagram .pr-badge { fill: var(--pr-badge-class); }
  .pr-diagram .pr-classifier-interface .pr-badge { fill: var(--pr-badge-interface); }
  .pr-diagram .pr-classifier-enum .pr-badge { fill: var(--pr-badge-enum); }
  .pr-diagram .pr-classifier-function .pr-badge, .pr-diagram .pr-stereotype-function .pr-badge { fill: var(--pr-badge-function); }
  .pr-diagram .pr-abstract .pr-badge { fill: var(--pr-badge-abstract); }
  .pr-diagram .pr-badge-text { fill: var(--pr-box-fill); font-size: 9.5px; font-weight: 700; }
  .pr-diagram .pr-header { font-weight: 700; fill: var(--pr-name); }
  .pr-diagram .pr-abstract .pr-header { font-style: italic; }
  .pr-diagram .pr-stereo { fill: var(--pr-muted); font-size: 10.5px; }
  .pr-diagram .pr-sep { stroke: var(--pr-stroke); }
  .pr-diagram .pr-name { fill: var(--pr-name); }
  .pr-diagram .pr-type { fill: var(--pr-type); }
  .pr-diagram .pr-param { fill: var(--pr-param); }
  .pr-diagram .pr-punct { fill: var(--pr-punct); }
  .pr-diagram .pr-static { text-decoration: underline; }
  .pr-diagram .pr-abstract-member { font-style: italic; }
  .pr-diagram .pr-vis-public { fill: var(--pr-vis-public); }
  .pr-diagram .pr-vis-private { fill: var(--pr-vis-private); }
  .pr-diagram .pr-vis-protected { fill: var(--pr-vis-protected); }
  .pr-diagram .pr-vis-package { fill: var(--pr-vis-package); }
  .pr-diagram .pr-container > rect { fill: var(--pr-container-fill); stroke: var(--pr-container-stroke); }
  .pr-diagram .pr-container > .pr-header { fill: var(--pr-muted); font-weight: 600; font-size: 11px; letter-spacing: .4px; }
  .pr-diagram .pr-note path { fill: var(--pr-note-fill); stroke: var(--pr-note-stroke); }
  .pr-diagram .pr-edge { stroke: var(--pr-edge); fill: none; }
  .pr-diagram .pr-edge-realization, .pr-diagram .pr-edge-dependency, .pr-diagram .pr-edge-attachment { stroke-dasharray: 6 4; }
  .pr-diagram .pr-edge-label { fill: var(--pr-muted); font-size: 11px; paint-order: stroke; stroke: var(--pr-box-fill); stroke-width: 3px; stroke-linejoin: round; }
  .pr-diagram marker path { fill: var(--pr-box-fill); stroke: var(--pr-edge); }
  .pr-diagram marker .pr-filled { fill: var(--pr-edge); }
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

const VISIBILITY: Record<string, string> = { "+": "public", "-": "private", "#": "protected", "~": "package" };

/** Split on top-level commas: generics and nested parentheses stay whole. */
function splitParams(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if ("([<{".includes(ch)) depth += 1;
    else if (")]>}".includes(ch)) depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) out.push(current);
  return out;
}

/** One member line in the canonical plantuml-fmt style, tokenised into
 * syntax-coloured tspans (REQ-00015-1): the visibility (drawn as a dot by
 * the caller), `{static}` underlined and `{abstract}` italic per UML, the
 * name, the parameters with their types, the return or attribute type. */
export function memberMarkup(line: string): { visibility: string | undefined; inner: string } {
  const match = /^\s*([+\-#~])?\s*((?:\{(?:static|abstract)\}\s*)*)(.*)$/.exec(line)!;
  const visibility = match[1] ? VISIBILITY[match[1]] : undefined;
  const modifiers = match[2] ?? "";
  const body = (match[3] ?? "").trim();
  const nameClass = [
    "pr-name",
    /\{static\}/.test(modifiers) ? "pr-static" : "",
    /\{abstract\}/.test(modifiers) ? "pr-abstract-member" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const typed = (type: string) => `<tspan class="pr-type">${esc(type.trim())}</tspan>`;
  const method = /^([^\s(:]+)\s*\((.*)\)\s*(?::\s*(.+))?$/.exec(body);
  if (method) {
    const params = splitParams(method[2])
      .map((param) => {
        const colon = param.indexOf(":");
        return colon < 0
          ? `<tspan class="pr-param">${esc(param.trim())}</tspan>`
          : `<tspan class="pr-param">${esc(param.slice(0, colon).trim())}</tspan><tspan class="pr-punct">: </tspan>${typed(param.slice(colon + 1))}`;
      })
      .join('<tspan class="pr-punct">, </tspan>');
    const returns = method[3] ? `<tspan class="pr-punct"> : </tspan>${typed(method[3])}` : "";
    return {
      visibility,
      inner: `<tspan class="${nameClass}">${esc(method[1])}</tspan><tspan class="pr-punct">(</tspan>${params}<tspan class="pr-punct">)</tspan>${returns}`,
    };
  }
  const attribute = /^([^\s:]+)\s*:\s*(.+)$/.exec(body);
  if (attribute) {
    return {
      visibility,
      inner: `<tspan class="${nameClass}">${esc(attribute[1])}</tspan><tspan class="pr-punct"> : </tspan>${typed(attribute[2])}`,
    };
  }
  return { visibility, inner: `<tspan class="${nameClass}">${esc(body)}</tspan>` };
}

/** The letter in the classifier badge (REQ-00016-1). */
export const BADGE: Record<string, string> = {
  class: "C",
  interface: "I",
  enum: "E",
  function: "f",
  struct: "S",
  record: "R",
  protocol: "P",
  annotation: "@",
  exception: "X",
};
