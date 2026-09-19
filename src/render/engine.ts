/**
 * The engine: render-IR → deterministic SVG.
 *
 * Determinism is the contract: same IR, byte-identical SVG. Layout is a
 * pure function — nodes are layered by hierarchy edges (inheritance /
 * realization point upward), unconnected nodes flow row-wise, containers
 * wrap their children recursively. Sizing uses a fixed monospace metrics
 * table, never font measurement. All coordinates are integers.
 *
 * Theming happens through CSS custom properties on stable classes
 * (`pr-box`, `pr-classifier-<classifier>`, `pr-edge-<kind>`); the engine
 * never hardcodes a palette beyond neutral fallbacks.
 */

import { type IrEdge, type IrNode, type RenderIr, validateIr } from "./ir.js";
import { renderSequenceSvg } from "./sequence.js";
import { BADGE, CHAR_W, LINE_H, PAD, STYLE, esc, idPrefix, linked, memberMarkup, refAttrs, svgRoot, tooltip } from "./shared.js";

const SECTION_GAP = 4;
const GAP_X = 48;
const GAP_Y = 64;
const CONTAINER_PAD = 18;
const CONTAINER_LABEL_H = 22;

interface Placed {
  node: IrNode;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Frame {
  node: IrNode | null;
  children: (Frame | IrNode)[];
}

export interface RenderOptions {
  /** POC: per-node drag deltas applied after layout; edges re-anchor. */
  positions?: Record<string, { dx: number; dy: number }>;
}

export function renderSvg(input: unknown, opts: RenderOptions = {}): string {
  const ir = validateIr(input);
  // A lifeline switches the whole document to the time-axis layout;
  // position overrides don't apply there (rows are the layout).
  if (ir.nodes.some((n) => n.kind === "lifeline")) {
    return renderSequenceSvg(ir);
  }
  const placed = layout(ir);
  if (opts.positions) {
    applyDeltas(ir, placed, opts.positions);
  }
  adaptContainers(placed);
  return emit(ir, placed);
}

/** A node's effective delta cascades: its own plus every ancestor
 * container's — dragging a namespace moves its whole subtree. */
function applyDeltas(
  ir: RenderIr,
  placed: Placed[],
  positions: NonNullable<RenderOptions["positions"]>,
): void {
  const parentOf = new Map(ir.nodes.map((n) => [n.id, n.parent]));
  for (const p of placed) {
    let dx = 0;
    let dy = 0;
    let id: string | undefined = p.node.id;
    while (id) {
      const delta = positions[id];
      if (delta) {
        dx += delta.dx;
        dy += delta.dy;
      }
      id = parentOf.get(id) ?? undefined;
    }
    p.x += dx;
    p.y += dy;
  }
}

/** Containers stretch to enclose their (possibly dragged) children.
 * `placed` lists children before their container, so one forward pass
 * folds bottom-up. */
function adaptContainers(placed: Placed[]): void {
  const byId = new Map(placed.map((p) => [p.node.id, p]));
  for (const p of placed) {
    if (p.node.kind !== "container") continue;
    const children = placed.filter(
      (c) => c.node.parent === p.node.id && byId.has(c.node.id),
    );
    if (children.length === 0) continue;
    const minX = Math.min(...children.map((c) => c.x)) - CONTAINER_PAD;
    const minY =
      Math.min(...children.map((c) => c.y)) - CONTAINER_PAD - CONTAINER_LABEL_H;
    const maxX = Math.max(...children.map((c) => c.x + c.w)) + CONTAINER_PAD;
    const maxY = Math.max(...children.map((c) => c.y + c.h)) + CONTAINER_PAD;
    p.x = minX;
    p.y = minY;
    p.w = Math.max(maxX - minX, p.node.label.length * CHAR_W + 16);
    p.h = maxY - minY;
  }
}

// ── Layout ───────────────────────────────────────────────────────────────────

const BADGE_W = 20; // badge circle plus the gap before the name
const DOT_W = 12; // visibility dot plus the gap before the member
const NOTE_FOLD = 9; // folded corner of a note

/** A note's lines: the PlantUML `\\n` escape and real newlines both break. */
function noteLines(node: IrNode): string[] {
  return node.label.split(/\\n|\n/);
}

function nodeSize(node: IrNode): { w: number; h: number } {
  if (node.kind === "note") {
    const lines = noteLines(node);
    return {
      w: Math.max(1, ...lines.map((l) => l.length)) * CHAR_W + 2 * PAD + NOTE_FOLD,
      h: 2 * PAD + lines.length * LINE_H,
    };
  }
  const headerLines = [headerText(node)];
  if (node.stereotype) headerLines.unshift(`«${node.stereotype}»`);
  const sections = node.sections ?? [];
  const textW = Math.max(
    headerText(node).length * CHAR_W + (node.kind === "box" ? BADGE_W : 0),
    (node.stereotype ?? "").length * CHAR_W + 16,
    ...sections.flat().map((l) => l.length * CHAR_W + DOT_W),
  );
  const w = textW + 2 * PAD;
  const sectionLines = sections.reduce((n, s) => n + s.length, 0);
  const h =
    2 * PAD +
    headerLines.length * LINE_H +
    sections.length * SECTION_GAP +
    sectionLines * LINE_H;
  return { w, h };
}

function headerText(node: IrNode): string {
  return node.label;
}

function buildFrames(ir: RenderIr): Frame {
  const byId = new Map(ir.nodes.map((n) => [n.id, n]));
  const frames = new Map<string, Frame>();
  const root: Frame = { node: null, children: [] };
  for (const node of ir.nodes) {
    if (node.kind === "container") {
      frames.set(node.id, { node, children: [] });
    }
  }
  const attached = new Set<string>();
  for (const node of ir.nodes) {
    const target =
      node.parent && frames.has(node.parent) ? frames.get(node.parent)! : root;
    if (node.kind === "container") {
      // duplicate container ids collapse to one frame — attach it once
      if (attached.has(node.id)) continue;
      attached.add(node.id);
      const frame = frames.get(node.id)!;
      if (node.parent && frames.has(node.parent) && byId.has(node.parent)) {
        frames.get(node.parent)!.children.push(frame);
      } else {
        root.children.push(frame);
      }
    } else {
      target.children.push(node);
    }
  }
  return root;
}

/** Layer leaf nodes: hierarchy targets (inheritance/realization) sit above. */
function layerOrder(nodes: IrNode[], edges: IrEdge[]): IrNode[][] {
  const ids = new Set(nodes.map((n) => n.id));
  const up = edges.filter(
    (e) =>
      (e.kind === "inheritance" || e.kind === "realization") &&
      ids.has(e.from) &&
      ids.has(e.to),
  );
  const depth = new Map<string, number>();
  const depthOf = (id: string, seen: Set<string>): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const parents = up.filter((e) => e.from === id).map((e) => e.to);
    const d = parents.length
      ? 1 + Math.max(...parents.map((p) => depthOf(p, seen)))
      : 0;
    depth.set(id, d);
    return d;
  };
  for (const n of nodes) depthOf(n.id, new Set());
  const layers: IrNode[][] = [];
  for (const n of nodes) {
    const d = depth.get(n.id) ?? 0;
    (layers[d] ??= []).push(n);
  }
  return layers.filter((l) => l.length > 0);
}

function layoutFrame(
  frame: Frame,
  edges: IrEdge[],
  originX: number,
  originY: number,
  placed: Placed[],
): { w: number; h: number } {
  const leaves = frame.children.filter((c): c is IrNode => !("children" in c));
  const subFrames = frame.children.filter((c): c is Frame => "children" in c);

  const isContainer = frame.node !== null;
  const innerX = originX + (isContainer ? CONTAINER_PAD : 0);
  let cursorY = originY + (isContainer ? CONTAINER_LABEL_H + CONTAINER_PAD : 0);
  let maxW = 0;

  for (const layer of layerOrder(leaves, edges)) {
    let cursorX = innerX;
    let rowH = 0;
    for (const node of layer) {
      const { w, h } = nodeSize(node);
      placed.push({ node, x: cursorX, y: cursorY, w, h });
      cursorX += w + GAP_X;
      rowH = Math.max(rowH, h);
    }
    maxW = Math.max(maxW, cursorX - GAP_X - innerX);
    cursorY += rowH + GAP_Y;
  }
  if (leaves.length > 0) cursorY -= GAP_Y;

  for (const sub of subFrames) {
    if (leaves.length > 0 || sub !== subFrames[0]) cursorY += GAP_Y / 2;
    const size = layoutFrame(sub, edges, innerX, cursorY, placed);
    maxW = Math.max(maxW, size.w);
    cursorY += size.h;
  }

  const contentW = Math.max(maxW, isContainer ? frame.node!.label.length * CHAR_W : 0);
  const w = contentW + (isContainer ? 2 * CONTAINER_PAD : 0);
  const h =
    cursorY - originY + (isContainer ? CONTAINER_PAD : 0);
  if (isContainer) {
    placed.push({ node: frame.node!, x: originX, y: originY, w, h });
  }
  return { w, h };
}

function layout(ir: RenderIr): Placed[] {
  const placed: Placed[] = [];
  layoutFrame(buildFrames(ir), ir.edges, PAD, PAD, placed);
  return placed;
}

// ── SVG emission ─────────────────────────────────────────────────────────────

const markers = (px: string) => `
  <marker id="${px}tri" viewBox="0 0 14 12" refX="13" refY="6" markerWidth="14" markerHeight="12" orient="auto"><path d="M1,1 L13,6 L1,11 Z"/></marker>
  <marker id="${px}diamond-filled" viewBox="0 0 16 10" refX="15" refY="5" markerWidth="16" markerHeight="10" orient="auto"><path class="pr-filled" d="M1,5 L8,1 L15,5 L8,9 Z"/></marker>
  <marker id="${px}diamond" viewBox="0 0 16 10" refX="15" refY="5" markerWidth="16" markerHeight="10" orient="auto"><path d="M1,5 L8,1 L15,5 L8,9 Z"/></marker>
  <marker id="${px}arrow" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" orient="auto"><path class="pr-open" d="M1,1 L11,6 L1,11"/></marker>
`;

const MARKER_BY_KIND: Record<string, string> = {
  inheritance: "tri",
  realization: "tri",
  composition: "diamond-filled",
  aggregation: "diamond",
  dependency: "arrow",
  association: "arrow",
};

function anchor(p: Placed, other: Placed): { x: number; y: number } {
  const cx = p.x + p.w / 2;
  if (other.y + other.h <= p.y) return { x: cx, y: p.y };
  if (other.y >= p.y + p.h) return { x: cx, y: p.y + p.h };
  const cy = p.y + p.h / 2;
  return other.x >= cx ? { x: p.x + p.w, y: cy } : { x: p.x, y: cy };
}

function classifierOf(node: IrNode): string | undefined {
  return node.classifier ?? (node.stereotype === "function" ? "function" : undefined);
}

function emitNode(p: Placed, px: string): string {
  const node = p.node;
  const classifier = classifierOf(node);
  const classes = [
    `pr-${node.kind}`,
    classifier ? `pr-classifier-${classifier}` : "",
    node.stereotype ? `pr-stereotype-${node.stereotype.replace(/\W+/g, "-")}` : "",
    node.abstract ? "pr-abstract" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const parts: string[] = [
    `<g id="${px}${esc(node.id)}" data-id="${esc(node.id)}" class="${classes}"${refAttrs(node.refs)}>`,
    tooltip(node.title),
  ];
  if (node.kind === "container") {
    parts.push(`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="6"/>`);
    parts.push(`<text class="pr-header" x="${p.x + 10}" y="${p.y + 15}">${esc(node.label)}</text>`);
  } else if (node.kind === "note") {
    const f = NOTE_FOLD;
    parts.push(`<path d="M${p.x},${p.y} H${p.x + p.w - f} L${p.x + p.w},${p.y + f} V${p.y + p.h} H${p.x} Z"/>`);
    parts.push(`<path d="M${p.x + p.w - f},${p.y} V${p.y + f} H${p.x + p.w}"/>`);
    noteLines(node).forEach((line, i) =>
      parts.push(`<text x="${p.x + PAD}" y="${p.y + PAD + 12 + i * LINE_H}">${esc(line)}</text>`),
    );
  } else {
    parts.push(`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="4"/>`);
    let ty = p.y + PAD + 12;
    const sections = node.sections ?? [];
    // header band with rounded top corners, painted under the header text
    const r = 4;
    const bandH = sections.length ? PAD + 12 + (node.stereotype ? LINE_H : 0) + SECTION_GAP + 6 : p.h;
    parts.push(
      `<path class="pr-head" d="M${p.x + r},${p.y} H${p.x + p.w - r} A${r},${r} 0 0 1 ${p.x + p.w},${p.y + r} V${p.y + bandH} H${p.x} V${p.y + r} A${r},${r} 0 0 1 ${p.x + r},${p.y} Z"/>`,
    );
    if (node.stereotype) {
      parts.push(`<text class="pr-stereo" x="${p.x + PAD}" y="${ty - 2}">${esc(`«${node.stereotype}»`)}</text>`);
      ty += LINE_H;
    }
    const letter =
      node.abstract && !classifier ? "A" : (BADGE[classifier ?? "class"] ?? (classifier ?? "C")[0].toUpperCase());
    parts.push(`<circle class="pr-badge" cx="${p.x + PAD + 7}" cy="${ty - 4}" r="7"/>`);
    parts.push(`<text class="pr-badge-text" x="${p.x + PAD + 7}" y="${ty - 0.5}" text-anchor="middle">${esc(letter)}</text>`);
    parts.push(`<text class="pr-header" x="${p.x + PAD + BADGE_W}" y="${ty}">${esc(node.label)}</text>`);
    ty += LINE_H;
    for (const section of sections) {
      const sepY = ty - LINE_H + SECTION_GAP + 6;
      parts.push(`<line class="pr-sep" x1="${p.x}" y1="${sepY}" x2="${p.x + p.w}" y2="${sepY}"/>`);
      ty += SECTION_GAP;
      for (const line of section) {
        const { visibility, inner } = memberMarkup(line);
        if (visibility) {
          parts.push(`<circle class="pr-vis pr-vis-${visibility}" cx="${p.x + PAD + 4}" cy="${ty - 4}" r="3.5"/>`);
        }
        parts.push(`<text x="${p.x + PAD + (visibility ? DOT_W : 0)}" y="${ty}">${inner}</text>`);
        ty += LINE_H;
      }
    }
  }
  parts.push("</g>");
  return linked(node.href, parts.join(""));
}

function emitEdge(edge: IrEdge, byId: Map<string, Placed>, px: string): { path: string; label: string } {
  const from = byId.get(edge.from);
  const to = byId.get(edge.to);
  if (!from || !to) return { path: "", label: "" };
  const a = anchor(from, to);
  const b = anchor(to, from);
  const marker = MARKER_BY_KIND[edge.kind];
  const markerAttr = marker ? ` marker-end="url(#${px}${marker})"` : "";
  const label = edge.label
    ? `<text class="pr-edge-label" x="${Math.round((a.x + b.x) / 2) + 6}" y="${Math.round((a.y + b.y) / 2) - 4}">${esc(edge.label)}</text>`
    : "";
  const path = `<path class="pr-edge pr-edge-${edge.kind}" data-from="${esc(edge.from)}" data-to="${esc(edge.to)}" d="M${a.x},${a.y} L${b.x},${b.y}"${markerAttr}${refAttrs(edge.refs)}>${tooltip(edge.title)}</path>`;
  return { path: linked(edge.href, path), label };
}

function emit(ir: RenderIr, placed: Placed[]): string {
  // The frame is the content's bounding box plus PAD on every side.
  const minX = Math.min(...placed.map((p) => p.x)) - PAD;
  const minY = Math.min(...placed.map((p) => p.y)) - PAD;
  const width = Math.max(...placed.map((p) => p.x + p.w), 10) + PAD - minX;
  const height = Math.max(...placed.map((p) => p.y + p.h), 10) + PAD - minY;
  const byId = new Map(placed.map((p) => [p.node.id, p]));
  const containers = placed.filter((p) => p.node.kind === "container");
  const leaves = placed.filter((p) => p.node.kind !== "container");
  const px = idPrefix(ir.title);
  // Paint order (REQ-00016-1): containers parent-first (placed lists a
  // subtree before its frame, so reversing paints the outer frame under
  // the inner ones), then edges, then leaves, then edge labels so no box
  // covers a label.
  const edges = ir.edges.map((e) => emitEdge(e, byId, px));
  const body = [
    ...[...containers].reverse().map((p) => emitNode(p, px)),
    ...edges.map((e) => e.path),
    ...leaves.map((p) => emitNode(p, px)),
    ...edges.map((e) => e.label),
  ]
    .filter(Boolean)
    .join("\n");
  return [
    svgRoot(minX, minY, width, height),
    ir.title ? `<title>${esc(ir.title)}</title>` : "",
    `<style>${STYLE}</style>`,
    `<defs>${markers(px)}</defs>`,
    body,
    "</svg>",
  ]
    .filter(Boolean)
    .join("\n");
}
