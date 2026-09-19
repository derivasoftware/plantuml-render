/**
 * Sequence layout: the time-axis half of the engine. Same contract as
 * the class layout — deterministic, integer coordinates, fixed metrics,
 * themable through CSS variables, stable ids — but rows instead of
 * layers: every message, `==` divider and anchored note occupies the
 * row its `order`/`at` claims; frames wrap row ranges.
 *
 * Scope is evidence-driven from the argos sequence corpus: participant
 * heads (all kinds, drawn as boxes so box theming applies), solid and
 * dashed messages, self-message loops, alt/else and loop frames, `==`
 * divider bands and right-anchored notes. Position overrides do not
 * apply here (rows are the layout).
 */

import { type IrNode, type RenderIr } from "./ir.js";
import { CHAR_W, LINE_H, PAD, STYLE, esc, idPrefix, svgRoot } from "./shared.js";

const HEAD_H = LINE_H + 2 * PAD;
const ROW_H = 30;
const MARGIN = 20;
const SELF_W = 32;

const SEQ_STYLE = `
  .pr-diagram .pr-lifeline-line { stroke: var(--pr-stroke); stroke-dasharray: 4 4; }
  .pr-diagram .pr-msg { stroke: var(--pr-stroke); fill: none; }
  .pr-diagram .pr-msg-dashed { stroke-dasharray: 6 4; }
  .pr-diagram .pr-frame > rect { fill: none; stroke: var(--pr-stroke); }
  .pr-diagram .pr-frame-label { font-weight: 600; }
  .pr-diagram .pr-frame-divider { stroke: var(--pr-stroke); stroke-dasharray: 6 4; }
  .pr-diagram .pr-divider rect { fill: var(--pr-box-fill); stroke: var(--pr-stroke); }
`;

export function renderSequenceSvg(ir: RenderIr): string {
  const px = idPrefix(ir.title);
  const lifelines = ir.nodes.filter((n) => n.kind === "lifeline");
  const frames = ir.nodes.filter((n) => n.kind === "frame");
  const dividers = ir.nodes.filter((n) => n.kind === "divider");
  const notes = ir.nodes.filter((n) => n.kind === "note");
  const messages = ir.edges.filter((e) => e.kind === "message");

  // ── Geometry ──────────────────────────────────────────────────────
  const headW = (n: IrNode) => n.label.length * CHAR_W + 2 * PAD;
  const maxHead = Math.max(...lifelines.map(headW), 40);
  const maxLabel = Math.max(
    ...messages.map((m) => (m.label ?? "").length * CHAR_W),
    0,
  );
  const pitch = Math.max(maxHead + 24, maxLabel + 32);
  const cx = new Map<string, number>();
  lifelines.forEach((n, i) => {
    cx.set(n.id, MARGIN + i * pitch + Math.round(pitch / 2));
  });

  const rows =
    Math.max(
      ...messages.map((m) => m.order ?? 0),
      ...[...dividers, ...notes].map((n) => n.at ?? 0),
      ...frames.map((f) => f.span?.[1] ?? 0),
      -1,
    ) + 1;
  const rowTop = (o: number) => MARGIN + HEAD_H + 16 + o * ROW_H;
  const lineY = (o: number) => rowTop(o) + 20;
  const bottom = rowTop(rows) + PAD;

  const laneL = MARGIN;
  const laneR = MARGIN + lifelines.length * pitch;
  let width = laneR + MARGIN;

  const parts: string[] = [];

  // ── Frames (background), inset by nesting depth ───────────────────
  const depth = (f: IrNode) =>
    frames.filter(
      (g) =>
        g !== f &&
        g.span &&
        f.span &&
        g.span[0] <= f.span[0] &&
        g.span[1] >= f.span[1] &&
        (g.span[0] < f.span[0] || g.span[1] > f.span[1]),
    ).length;
  for (const frame of frames) {
    if (!frame.span) continue;
    const inset = depth(frame) * 8;
    const x = laneL + inset;
    const w = laneR - laneL - 2 * inset;
    const y = rowTop(frame.span[0]) - 4;
    const h = rowTop(frame.span[1]) + ROW_H - y;
    const tabW = frame.label.length * CHAR_W + 2 * PAD;
    parts.push(
      `<g id="${px}${esc(frame.id)}" data-id="${esc(frame.id)}" class="pr-frame">` +
        `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>` +
        `<text class="pr-frame-label" x="${x + PAD}" y="${y + 14}">${esc(frame.label)}</text>` +
        (frame.dividers ?? [])
          .map(
            (d) =>
              `<line class="pr-frame-divider" x1="${x}" y1="${rowTop(d.at) - 2}" x2="${x + w}" y2="${rowTop(d.at) - 2}"/>` +
              `<text x="${x + PAD}" y="${rowTop(d.at) + 12}">[${esc(d.label)}]</text>`,
          )
          .join("") +
        "</g>",
    );
    width = Math.max(width, x + tabW + MARGIN);
  }

  // ── Divider bands ─────────────────────────────────────────────────
  for (const d of dividers) {
    const y = rowTop(d.at ?? 0) + 6;
    parts.push(
      `<g id="${px}${esc(d.id)}" data-id="${esc(d.id)}" class="pr-divider">` +
        `<rect x="${laneL}" y="${y}" width="${laneR - laneL}" height="16"/>` +
        `<text x="${Math.round((laneL + laneR) / 2 - (d.label.length * CHAR_W) / 2)}" y="${y + 12}">${esc(d.label)}</text>` +
        "</g>",
    );
  }

  // ── Lifelines: dashed line + head box ─────────────────────────────
  for (const n of lifelines) {
    const x = cx.get(n.id)!;
    const w = headW(n);
    const classes = ["pr-box", "pr-lifeline-head"];
    if (n.classifier) classes.push(`pr-classifier-${n.classifier}`);
    parts.push(
      `<g id="${px}${esc(n.id)}" data-id="${esc(n.id)}" class="${classes.join(" ")}">` +
        `<line class="pr-lifeline-line" x1="${x}" y1="${MARGIN + HEAD_H}" x2="${x}" y2="${bottom}"/>` +
        `<rect x="${x - Math.round(w / 2)}" y="${MARGIN}" width="${w}" height="${HEAD_H}"/>` +
        `<text class="pr-header" x="${x - Math.round(w / 2) + PAD}" y="${MARGIN + PAD + 13}">${esc(n.label)}</text>` +
        "</g>",
    );
  }

  // ── Messages ──────────────────────────────────────────────────────
  for (const m of messages) {
    const y = lineY(m.order ?? 0);
    const xa = cx.get(m.from);
    const xb = cx.get(m.to);
    if (xa === undefined || xb === undefined) continue;
    const classes = ["pr-msg"];
    if (m.dashed) classes.push("pr-msg-dashed");
    const attrs = `class="${classes.join(" ")}" data-from="${esc(m.from)}" data-to="${esc(m.to)}" data-order="${m.order}"`;
    if (m.from === m.to) {
      classes.push("pr-msg-self");
      parts.push(
        `<path class="${classes.join(" ")}" data-from="${esc(m.from)}" data-to="${esc(m.to)}" data-order="${m.order}" d="M${xa} ${y - 8} L${xa + SELF_W} ${y - 8} L${xa + SELF_W} ${y + 4} L${xa + 4} ${y + 4}" marker-end="url(#${px}arrow)"/>`,
      );
      if (m.label) {
        parts.push(
          `<text x="${xa + SELF_W + 6}" y="${y}">${esc(m.label)}</text>`,
        );
        width = Math.max(width, xa + SELF_W + 6 + m.label.length * CHAR_W + MARGIN);
      }
    } else {
      parts.push(
        `<path ${attrs} d="M${xa} ${y} L${xb} ${y}" marker-end="url(#${px}arrow)"/>`,
      );
      if (m.label) {
        const mid = Math.round((xa + xb) / 2);
        parts.push(
          `<text x="${mid - Math.round((m.label.length * CHAR_W) / 2)}" y="${y - 5}">${esc(m.label)}</text>`,
        );
      }
    }
  }

  // ── Anchored notes ────────────────────────────────────────────────
  for (const n of notes) {
    const anchorX = n.anchor !== undefined ? cx.get(n.anchor) : undefined;
    const lines = n.label.split("\n");
    const w = Math.max(...lines.map((l) => l.length)) * CHAR_W + 2 * PAD;
    const h = lines.length * LINE_H + PAD;
    const y = rowTop(n.at ?? 0);
    const x =
      anchorX === undefined
        ? laneR
        : n.classifier === "left"
          ? anchorX - w - 16
          : n.classifier === "over"
            ? anchorX - Math.round(w / 2)
            : anchorX + 16;
    parts.push(
      `<g id="${px}${esc(n.id)}" data-id="${esc(n.id)}" class="pr-note">` +
        `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>` +
        lines
          .map(
            (l, i) =>
              `<text x="${x + PAD}" y="${y + PAD + 4 + i * LINE_H}">${esc(l)}</text>`,
          )
          .join("") +
        "</g>",
    );
    width = Math.max(width, x + w + MARGIN);
  }

  const height = bottom + MARGIN;
  return [
    svgRoot(0, 0, width, height),
    ir.title ? `<title>${esc(ir.title)}</title>` : "",
    `<style>${STYLE}${SEQ_STYLE}</style>`,
    `<defs><marker id="${px}arrow" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" orient="auto"><path class="pr-open" d="M1,1 L11,6 L1,11"/></marker></defs>`,
    parts.join("\n"),
    "</svg>",
  ]
    .filter(Boolean)
    .join("\n");
}
