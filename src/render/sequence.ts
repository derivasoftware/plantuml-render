/**
 * Sequence layout: the time-axis half of the engine. Same contract as
 * the class layout — deterministic, integer coordinates, fixed metrics,
 * themable through CSS variables, stable ids — but rows instead of
 * layers: every message, `==` divider and anchored note occupies the
 * row its `order`/`at` claims; frames wrap row ranges.
 *
 * Geometry is content-driven (REQ-00019-1): the gap between two adjacent
 * lanes is what the heads, the labels of the messages that cross it, the
 * self-message loops and the notes beside it need; a frame spans only the
 * lanes its messages and notes touch; a row is as tall as its tallest
 * occupant (a multi-line note, a divider band).
 *
 * Scope is evidence-driven from the argos sequence corpus: participant
 * heads (all kinds, drawn as boxes so box theming applies), solid and
 * dashed messages, self-message loops, alt/else and loop frames, `==`
 * divider bands and right-anchored notes. Position overrides do not
 * apply here (rows are the layout).
 */

import { type IrEdge, type IrNode, type RenderIr } from "./ir.js";
import { CHAR_W, LINE_H, PAD, STYLE, esc, idPrefix, linked, refAttrs, svgRoot, tooltip } from "./shared.js";

const HEAD_H = LINE_H + 2 * PAD;
const ROW_H = 30;
const MARGIN = 20;
const SELF_W = 32;
const FRAME_LEAD = 18; // room for a frame tab or an else label at the top of a row
const FRAME_STACK = 10; // extra per nesting level when frames open on the same row

const SEQ_STYLE = `
  .pr-diagram .pr-lifeline-line { stroke: var(--pr-stroke); stroke-dasharray: 4 4; }
  .pr-diagram .pr-msg { stroke: var(--pr-edge); fill: none; }
  .pr-diagram .pr-msg-dashed { stroke-dasharray: 6 4; }
  .pr-diagram .pr-frame > rect { fill: none; stroke: var(--pr-stroke); }
  .pr-diagram .pr-frame-tab { fill: var(--pr-head-function); stroke: var(--pr-stroke); }
  .pr-diagram .pr-frame-label { font-weight: 700; fill: var(--pr-muted); }
  .pr-diagram .pr-frame-cond { fill: var(--pr-muted); }
  .pr-diagram .pr-frame-divider { stroke: var(--pr-stroke); stroke-dasharray: 6 4; }
  .pr-diagram .pr-divider rect { fill: var(--pr-container-fill); stroke: var(--pr-stroke); }
  .pr-diagram .pr-lifeline-head > rect { fill: var(--pr-head-class); stroke: var(--pr-stroke); }
  .pr-diagram .pr-note rect { fill: var(--pr-note-fill); stroke: var(--pr-note-stroke); }
  .pr-diagram .pr-actor circle, .pr-diagram .pr-actor path { fill: none; stroke: var(--pr-text); stroke-width: 1.4; stroke-linecap: round; }
`;

export function renderSequenceSvg(ir: RenderIr): string {
  const px = idPrefix(ir.title);
  const lifelines = ir.nodes.filter((n) => n.kind === "lifeline");
  const frames = ir.nodes.filter((n) => n.kind === "frame");
  const dividers = ir.nodes.filter((n) => n.kind === "divider");
  const notes = ir.nodes.filter((n) => n.kind === "note");
  const messages = ir.edges.filter((e) => e.kind === "message");

  // ── Lanes: content-driven gaps ────────────────────────────────────
  const lane = new Map(lifelines.map((n, i) => [n.id, i]));
  const isActor = (n: IrNode) => n.classifier === "actor";
  const headW = (n: IrNode) => (isActor(n) ? n.label.length * CHAR_W + 8 : n.label.length * CHAR_W + 2 * PAD);
  const halfHead = (i: number) => Math.ceil(headW(lifelines[i]) / 2);
  const textW = (s: string | undefined) => (s ?? "").length * CHAR_W;
  const noteLines = (n: IrNode) => n.label.split(/\\n|\n/);
  const noteW = (n: IrNode) => Math.max(...noteLines(n).map((l) => l.length)) * CHAR_W + 2 * PAD;
  const noteH = (n: IrNode) => noteLines(n).length * LINE_H + PAD;
  const count = lifelines.length;
  const gaps: number[] = [];
  for (let i = 0; i + 1 < count; i++) gaps.push(halfHead(i) + halfHead(i + 1) + 24);
  /** Make the lanes a..b (a < b) at least `width` apart, widening the
   * gaps between them evenly (remainder on the last one). */
  const need = (a: number, b: number, width: number) => {
    if (a >= b || b >= count) return;
    let have = 0;
    for (let j = a; j < b; j++) have += gaps[j];
    if (have >= width) return;
    const deficit = width - have;
    const each = Math.floor(deficit / (b - a));
    for (let j = a; j < b; j++) gaps[j] += each;
    gaps[b - 1] += deficit - each * (b - a);
  };
  const selfExtent = (m: IrEdge) => SELF_W + 6 + textW(m.label) + 8;
  for (const m of [...messages].sort((p, q) => Math.abs(lane.get(p.to)! - lane.get(p.from)!) - Math.abs(lane.get(q.to)! - lane.get(q.from)!))) {
    const a = lane.get(m.from);
    const b = lane.get(m.to);
    if (a === undefined || b === undefined) continue;
    if (a === b) need(a, a + 1, selfExtent(m) + halfHead(Math.min(a + 1, count - 1)));
    else need(Math.min(a, b), Math.max(a, b), textW(m.label) + 32);
  }
  for (const n of notes) {
    const a = n.anchor !== undefined ? lane.get(n.anchor) : undefined;
    if (a === undefined) continue;
    const w = noteW(n);
    if (n.classifier === "left") need(a - 1, a, w + 24 + (a > 0 ? halfHead(a - 1) : 0));
    else if (n.classifier === "over") {
      if (a > 0) need(a - 1, a, Math.ceil(w / 2) + 8 + halfHead(a - 1));
      need(a, a + 1, Math.ceil(w / 2) + 8 + (a + 1 < count ? halfHead(a + 1) : 0));
    } else need(a, a + 1, w + 24 + (a + 1 < count ? halfHead(a + 1) : 0));
  }
  const cx = new Map<string, number>();
  let x = MARGIN + (count ? halfHead(0) : 0) + 16;
  lifelines.forEach((n, i) => {
    if (i > 0) x += gaps[i - 1];
    cx.set(n.id, x);
  });
  const laneL = MARGIN;
  const laneR = count ? cx.get(lifelines[count - 1].id)! + halfHead(count - 1) + 16 : MARGIN + 40;
  let width = laneR + MARGIN;

  // ── Rows: content-driven heights ──────────────────────────────────
  const rows =
    Math.max(
      ...messages.map((m) => m.order ?? 0),
      ...[...dividers, ...notes].map((n) => n.at ?? 0),
      ...frames.map((f) => f.span?.[1] ?? 0),
      -1,
    ) + 1;
  // A row opens with a lead when a frame starts there or an `else` divides
  // there: the tab or the divider label takes that room, the row's own
  // occupants sit below it. Nested frames opening on the same row stack
  // their tabs, so the lead grows with depth.
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
  const lead: number[] = new Array(rows).fill(0);
  for (const f of frames) {
    if (!f.span) continue;
    if (f.span[0] < rows) lead[f.span[0]] = Math.max(lead[f.span[0]], FRAME_LEAD + depth(f) * FRAME_STACK);
    for (const d of f.dividers ?? []) if (d.at < rows) lead[d.at] = Math.max(lead[d.at], FRAME_LEAD);
  }
  const rowH: number[] = lead.map((l) => ROW_H + l);
  for (const n of notes) if (n.at !== undefined && n.at < rows) rowH[n.at] = Math.max(rowH[n.at], lead[n.at] + noteH(n) + 10);
  const tops: number[] = [MARGIN + HEAD_H + 16];
  for (let r = 0; r < rows; r++) tops.push(tops[r] + rowH[r]);
  const rowTop = (o: number) => tops[Math.min(o, rows)];
  const rowEnd = (o: number) => tops[Math.min(o + 1, rows)];
  const rowBody = (o: number) => rowTop(o) + (o < rows ? lead[o] : 0);
  const lineY = (o: number) => rowBody(o) + 20;
  const bottom = rowTop(rows) + PAD;

  const parts: string[] = [];

  // ── Frames, bounded to the lanes they touch, inset by nesting depth ─
  const noteX = (n: IrNode): number => {
    const anchorX = n.anchor !== undefined ? cx.get(n.anchor) : undefined;
    const w = noteW(n);
    if (anchorX === undefined) return laneR;
    if (n.classifier === "left") return anchorX - w - 16;
    if (n.classifier === "over") return anchorX - Math.round(w / 2);
    return anchorX + 16;
  };
  for (const frame of frames) {
    if (!frame.span) continue;
    const [first, last] = frame.span;
    const inside = (o: number | undefined) => o !== undefined && o >= first && o <= last;
    let left = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    for (const m of messages) {
      if (!inside(m.order)) continue;
      const a = lane.get(m.from);
      const b = lane.get(m.to);
      if (a === undefined || b === undefined) continue;
      for (const i of [a, b]) {
        left = Math.min(left, cx.get(lifelines[i].id)! - halfHead(i));
        right = Math.max(right, cx.get(lifelines[i].id)! + halfHead(i));
      }
      if (a === b) right = Math.max(right, cx.get(m.from)! + selfExtent(m));
    }
    for (const n of notes) {
      if (!inside(n.at)) continue;
      left = Math.min(left, noteX(n));
      right = Math.max(right, noteX(n) + noteW(n));
    }
    if (!Number.isFinite(left)) {
      left = laneL + 12;
      right = laneR - 12;
    }
    const inset = depth(frame) * 8;
    const [keyword, ...rest] = frame.label.split(" ");
    const condition = rest.join(" ");
    const tabW = keyword.length * CHAR_W + 2 * PAD;
    const x = left - 12 + inset;
    const w = Math.max(right + 12 - inset - x, tabW + (condition ? textW(condition) + 16 + 8 : 0) + 8);
    const y = rowTop(first) + depth(frame) * FRAME_STACK;
    const h = rowEnd(last) - 6 - y;
    parts.push(linked(frame.href,
      `<g id="${px}${esc(frame.id)}" data-id="${esc(frame.id)}" class="pr-frame"${refAttrs(frame.refs)}>${tooltip(frame.title)}` +
        `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>` +
        `<path class="pr-frame-tab" d="M${x},${y} H${x + tabW} V${y + 12} L${x + tabW - 6},${y + 18} H${x} Z"/>` +
        `<text class="pr-frame-label" x="${x + PAD}" y="${y + 13}">${esc(keyword)}</text>` +
        (condition ? `<text class="pr-frame-cond" x="${x + tabW + 8}" y="${y + 13}">[${esc(condition)}]</text>` : "") +
        (frame.dividers ?? [])
          .map(
            (d) =>
              `<line class="pr-frame-divider" x1="${x}" y1="${rowTop(d.at)}" x2="${x + w}" y2="${rowTop(d.at)}"/>` +
              `<text class="pr-frame-cond" x="${x + PAD}" y="${rowTop(d.at) + 14}">[${esc(d.label)}]</text>`,
          )
          .join("") +
        "</g>",
    ));
    width = Math.max(width, x + w + MARGIN);
  }

  // ── Divider bands ─────────────────────────────────────────────────
  for (const d of dividers) {
    const y = rowBody(d.at ?? 0) + 6;
    parts.push(
      `<g id="${px}${esc(d.id)}" data-id="${esc(d.id)}" class="pr-divider">` +
        `<rect x="${laneL}" y="${y}" width="${laneR - laneL}" height="16"/>` +
        `<text x="${Math.round((laneL + laneR) / 2 - (d.label.length * CHAR_W) / 2)}" y="${y + 12}">${esc(d.label)}</text>` +
        "</g>",
    );
  }

  // ── Lifelines: dashed line + head (box or actor) ──────────────────
  for (const n of lifelines) {
    const x = cx.get(n.id)!;
    const w = headW(n);
    const classes = ["pr-box", "pr-lifeline-head"];
    if (n.classifier) classes.push(`pr-classifier-${n.classifier}`);
    const head = isActor(n)
      ? `<g class="pr-actor"><circle cx="${x}" cy="${MARGIN + 5}" r="4.5"/>` +
        `<path d="M${x},${MARGIN + 10} V${MARGIN + 21} M${x - 8},${MARGIN + 14} H${x + 8} M${x},${MARGIN + 21} L${x - 7},${MARGIN + 30} M${x},${MARGIN + 21} L${x + 7},${MARGIN + 30}"/></g>` +
        `<text class="pr-header" x="${x}" y="${MARGIN + HEAD_H + 4}" text-anchor="middle">${esc(n.label)}</text>`
      : `<rect x="${x - Math.round(w / 2)}" y="${MARGIN}" width="${w}" height="${HEAD_H}"/>` +
        `<text class="pr-header" x="${x - Math.round(w / 2) + PAD}" y="${MARGIN + PAD + 13}">${esc(n.label)}</text>`;
    parts.push(linked(n.href,
      `<g id="${px}${esc(n.id)}" data-id="${esc(n.id)}" class="${classes.join(" ")}"${refAttrs(n.refs)}>${tooltip(n.title)}` +
        `<line class="pr-lifeline-line" x1="${x}" y1="${isActor(n) ? MARGIN + HEAD_H + 8 : MARGIN + HEAD_H}" x2="${x}" y2="${bottom}"/>` +
        head +
        "</g>",
    ));
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
        linked(m.href, `<path class="${classes.join(" ")}" data-from="${esc(m.from)}" data-to="${esc(m.to)}" data-order="${m.order}" d="M${xa} ${y - 8} L${xa + SELF_W} ${y - 8} L${xa + SELF_W} ${y + 4} L${xa + 4} ${y + 4}" marker-end="url(#${px}arrow)"${refAttrs(m.refs)}>${tooltip(m.title)}</path>`),
      );
      if (m.label) {
        parts.push(`<text x="${xa + SELF_W + 6}" y="${y}">${esc(m.label)}</text>`);
        width = Math.max(width, xa + selfExtent(m) + MARGIN);
      }
    } else {
      parts.push(
        linked(m.href, `<path ${attrs} d="M${xa} ${y} L${xb} ${y}" marker-end="url(#${px}arrow)"${refAttrs(m.refs)}>${tooltip(m.title)}</path>`),
      );
      if (m.label) {
        const mid = Math.round((xa + xb) / 2);
        parts.push(`<text x="${mid - Math.round(textW(m.label) / 2)}" y="${y - 5}">${esc(m.label)}</text>`);
      }
    }
  }

  // ── Anchored notes ────────────────────────────────────────────────
  for (const n of notes) {
    const lines = noteLines(n);
    const w = noteW(n);
    const h = noteH(n);
    const y = rowBody(n.at ?? 0);
    const x = noteX(n);
    parts.push(linked(n.href,
      `<g id="${px}${esc(n.id)}" data-id="${esc(n.id)}" class="pr-note"${refAttrs(n.refs)}>${tooltip(n.title)}` +
        `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>` +
        lines
          .map((l, i) => `<text x="${x + PAD}" y="${y + PAD + 4 + i * LINE_H}">${esc(l)}</text>`)
          .join("") +
        "</g>",
    ));
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
