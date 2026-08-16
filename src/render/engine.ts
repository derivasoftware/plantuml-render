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

const CHAR_W = 8;
const LINE_H = 18;
const PAD = 10;
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

function nodeSize(node: IrNode): { w: number; h: number } {
  const headerLines = [headerText(node)];
  if (node.stereotype) headerLines.unshift(`«${node.stereotype}»`);
  const sections = node.sections ?? [];
  const allLines = [...headerLines, ...sections.flat()];
  const textW = Math.max(1, ...allLines.map((l) => l.length)) * CHAR_W;
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

const STYLE = `
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

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const MARKERS = `
  <marker id="pr-tri" viewBox="0 0 14 12" refX="13" refY="6" markerWidth="14" markerHeight="12" orient="auto"><path d="M1,1 L13,6 L1,11 Z" fill="var(--pr-box-fill, #fdfdf6)" stroke="var(--pr-stroke, #3b3b33)"/></marker>
  <marker id="pr-diamond-filled" viewBox="0 0 16 10" refX="15" refY="5" markerWidth="16" markerHeight="10" orient="auto"><path d="M1,5 L8,1 L15,5 L8,9 Z" fill="var(--pr-stroke, #3b3b33)"/></marker>
  <marker id="pr-diamond" viewBox="0 0 16 10" refX="15" refY="5" markerWidth="16" markerHeight="10" orient="auto"><path d="M1,5 L8,1 L15,5 L8,9 Z" fill="var(--pr-box-fill, #fdfdf6)" stroke="var(--pr-stroke, #3b3b33)"/></marker>
  <marker id="pr-arrow" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" orient="auto"><path d="M1,1 L11,6 L1,11" fill="none" stroke="var(--pr-stroke, #3b3b33)"/></marker>
`;

const MARKER_BY_KIND: Record<string, string> = {
  inheritance: "pr-tri",
  realization: "pr-tri",
  composition: "pr-diamond-filled",
  aggregation: "pr-diamond",
  dependency: "pr-arrow",
  association: "pr-arrow",
};

function anchor(p: Placed, other: Placed): { x: number; y: number } {
  const cx = p.x + p.w / 2;
  if (other.y + other.h <= p.y) return { x: cx, y: p.y };
  if (other.y >= p.y + p.h) return { x: cx, y: p.y + p.h };
  const cy = p.y + p.h / 2;
  return other.x >= cx ? { x: p.x + p.w, y: cy } : { x: p.x, y: cy };
}

function emitNode(p: Placed): string {
  const node = p.node;
  const classes = [
    `pr-${node.kind}`,
    node.classifier ? `pr-classifier-${node.classifier}` : "",
    node.abstract ? "pr-abstract" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const parts: string[] = [
    `<g id="${esc(node.id)}" class="${classes}">`,
    `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}"/>`,
  ];
  let ty = p.y + PAD + 12;
  if (node.kind === "container") {
    parts.push(
      `<text class="pr-header" x="${p.x + 8}" y="${p.y + 15}">${esc(node.label)}</text>`,
    );
  } else {
    if (node.stereotype) {
      parts.push(`<text x="${p.x + PAD}" y="${ty}">${esc(`«${node.stereotype}»`)}</text>`);
      ty += LINE_H;
    }
    parts.push(
      `<text class="pr-header" x="${p.x + PAD}" y="${ty}">${esc(node.label)}</text>`,
    );
    ty += LINE_H;
    for (const section of node.sections ?? []) {
      const sepY = ty - LINE_H + SECTION_GAP + 6;
      parts.push(`<line class="pr-sep" x1="${p.x}" y1="${sepY}" x2="${p.x + p.w}" y2="${sepY}"/>`);
      ty += SECTION_GAP;
      for (const line of section) {
        parts.push(`<text x="${p.x + PAD}" y="${ty}">${esc(line)}</text>`);
        ty += LINE_H;
      }
    }
  }
  parts.push("</g>");
  return parts.join("");
}

function emitEdge(edge: IrEdge, byId: Map<string, Placed>): string {
  const from = byId.get(edge.from);
  const to = byId.get(edge.to);
  if (!from || !to) return "";
  const a = anchor(from, to);
  const b = anchor(to, from);
  const marker = MARKER_BY_KIND[edge.kind];
  const markerAttr = marker ? ` marker-end="url(#${marker})"` : "";
  const label = edge.label
    ? `<text x="${Math.round((a.x + b.x) / 2) + 6}" y="${Math.round((a.y + b.y) / 2) - 4}">${esc(edge.label)}</text>`
    : "";
  return (
    `<path class="pr-edge pr-edge-${edge.kind}" data-from="${esc(edge.from)}" data-to="${esc(edge.to)}" d="M${a.x},${a.y} L${b.x},${b.y}"${markerAttr}/>` +
    label
  );
}

function emit(ir: RenderIr, placed: Placed[]): string {
  const minX = Math.min(...placed.map((p) => p.x), 0) - PAD;
  const minY = Math.min(...placed.map((p) => p.y), 0) - PAD;
  const width = Math.max(...placed.map((p) => p.x + p.w), 10) + PAD - minX;
  const height = Math.max(...placed.map((p) => p.y + p.h), 10) + PAD - minY;
  const byId = new Map(placed.map((p) => [p.node.id, p]));
  const containers = placed.filter((p) => p.node.kind === "container");
  const leaves = placed.filter((p) => p.node.kind !== "container");
  const body = [
    ...containers.map(emitNode),
    ...ir.edges.map((e) => emitEdge(e, byId)),
    ...leaves.map(emitNode),
  ].join("\n");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}" class="pr-diagram" role="img">`,
    ir.title ? `<title>${esc(ir.title)}</title>` : "",
    `<style>${STYLE}</style>`,
    `<defs>${MARKERS}</defs>`,
    body,
    "</svg>",
  ]
    .filter(Boolean)
    .join("\n");
}
