/**
 * The engine: render-IR → deterministic SVG.
 *
 * Determinism is the contract: same IR, byte-identical SVG. Layout is the
 * layered algorithm of ELK (REQ-00020-1): hierarchy edges (inheritance /
 * realization) point upward, containers are compound nodes laid out with
 * their children, edges are routed orthogonally around the boxes and
 * labelled by the router; disconnected pieces are packed towards a
 * readable aspect. Sizing uses a fixed monospace metrics table, never font
 * measurement; every coordinate ELK returns is rounded to an integer, so
 * the same IR always yields the same bytes.
 *
 * Theming happens through CSS custom properties on stable classes
 * (`pr-box`, `pr-classifier-<classifier>`, `pr-edge-<kind>`); the engine
 * never hardcodes a palette beyond neutral fallbacks.
 */

import ElkModule from "elkjs/lib/elk.bundled.js";
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api.js";

import { type IrEdge, type IrNode, type RenderIr, validateIr } from "./ir.js";
import { renderSequenceSvg } from "./sequence.js";
import { BADGE, CHAR_W, LINE_H, PAD, STYLE, esc, idPrefix, linked, memberMarkup, refAttrs, svgRoot, tooltip } from "./shared.js";

const SECTION_GAP = 4;
const GAP_X = 40; // between nodes of one layer
const GAP_Y = 56; // between layers
const CONTAINER_PAD = 18;
const CONTAINER_LABEL_H = 22;
const LABEL_CHAR_W = 7; // edge labels are 11px
const LABEL_H = 14;

/** A routed edge: the polyline the router chose and where it put the label. */
interface Route {
  points: { x: number; y: number }[];
  label?: { x: number; y: number };
}

interface Placed {
  node: IrNode;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RenderOptions {
  /** POC: per-node drag deltas applied after layout; edges re-anchor. */
  positions?: Record<string, { dx: number; dy: number }>;
}

export async function renderSvg(input: unknown, opts: RenderOptions = {}): Promise<string> {
  const ir = validateIr(input);
  // A lifeline switches the whole document to the time-axis layout;
  // position overrides don't apply there (rows are the layout).
  if (ir.nodes.some((n) => n.kind === "lifeline")) {
    return renderSequenceSvg(ir);
  }
  const { placed, routes } = await layout(ir);
  if (opts.positions && Object.keys(opts.positions).length > 0) {
    // Dragged nodes leave the router's polylines behind: edges fall back
    // to straight anchored lines until the next full layout.
    applyDeltas(ir, placed, opts.positions);
    adaptContainers(placed);
    routes.clear();
  }
  return emit(ir, placed, routes);
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

// elkjs ships one bundle that is both the CommonJS export and a `default`
// export; pick whichever the host resolved.
type ElkInstance = { layout(graph: ElkNode): Promise<ElkNode> };
const ElkCtor = ((ElkModule as unknown as { default?: unknown }).default ?? ElkModule) as new () => ElkInstance;
const elk = new ElkCtor();

const LAYOUT_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.padding": "[top=0,left=0,bottom=0,right=0]",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.randomSeed": "1",
  "elk.aspectRatio": "1.6",
  "elk.spacing.nodeNode": String(GAP_X),
  "elk.spacing.edgeNode": "24",
  "elk.spacing.edgeEdge": "16",
  "elk.spacing.edgeLabel": "6",
  "elk.layered.spacing.nodeNodeBetweenLayers": String(GAP_Y),
  "elk.layered.spacing.edgeNodeBetweenLayers": "24",
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "elk.layered.crossingMinimization.forceNodeModelOrder": "false",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
  "elk.edgeLabels.placement": "CENTER",
  "elk.layered.edgeLabels.sideSelection": "SMART_DOWN",
};

const UPWARD = new Set(["inheritance", "realization"]);
const DIAMOND = new Set(["composition", "aggregation"]);
const PACK_SUFFIX = "\u0000pack"; // never a real IR id

interface ElkGraph {
  root: ElkNode;
  /** Id of the ELK node each IR edge (by index) was declared on: its
   * polyline comes back relative to that node. */
  edgeHome: Map<number, string>;
}

/** The ELK graph of the IR (REQ-00020-1). Containers are compound nodes,
 * boxes and notes leaves. At every level the children are split into
 * connected components by the edges that cross between them: a level with
 * several components is packed (rectpacking towards the aspect ratio), each
 * multi-node component laid out inside an invisible layered node, the
 * edge-less children placed as loose boxes. Hierarchy edges are reversed so
 * bases sit above their subtypes. */
function toElk(ir: RenderIr): ElkGraph {
  const byId = new Map(ir.nodes.map((n) => [n.id, n]));
  const containers = new Set(ir.nodes.filter((n) => n.kind === "container").map((n) => n.id));
  const parentOf = (n: IrNode) => (n.parent && containers.has(n.parent) && byId.has(n.parent) && n.parent !== n.id ? n.parent : "root");
  const elkNodes = new Map<string, ElkNode>();
  const kids = new Map<string, IrNode[]>();
  for (const node of ir.nodes) {
    if (elkNodes.has(node.id)) continue; // a reopened container is one compound node
    const { w, h } = nodeSize(node);
    elkNodes.set(node.id, {
      id: node.id,
      width: w,
      height: h,
      children: [],
      edges: [],
      layoutOptions:
        node.kind === "container"
          ? {
              "elk.hierarchyHandling": "INCLUDE_CHILDREN",
              "elk.padding": `[top=${CONTAINER_LABEL_H + CONTAINER_PAD},left=${CONTAINER_PAD},bottom=${CONTAINER_PAD},right=${CONTAINER_PAD}]`,
            }
          : {},
    });
    const p = parentOf(node);
    (kids.get(p) ?? kids.set(p, []).get(p)!).push(node);
  }
  // the child of `level` on the way up from `id`
  const childAt = (id: string, level: string): string | undefined => {
    let cur: IrNode | undefined = byId.get(id);
    while (cur) {
      const p = parentOf(cur);
      if (p === level) return cur.id;
      cur = byId.get(p);
    }
    return undefined;
  };
  const lcaOf = (a: string, b: string): string => {
    const chain: string[] = [];
    for (let cur = byId.get(a); cur; cur = byId.get(parentOf(cur))) chain.push(parentOf(cur));
    for (let cur = byId.get(b); cur; cur = byId.get(parentOf(cur))) {
      const p = parentOf(cur);
      if (chain.includes(p)) return p;
    }
    return "root";
  };
  const isAncestor = (maybe: string, of: string) => {
    for (let cur = byId.get(of); cur; cur = byId.get(parentOf(cur))) if (parentOf(cur) === maybe) return true;
    return false;
  };
  const edgesAt = new Map<string, number[]>();
  // A child whose subtree holds the end of an edge that reaches above its
  // level must stay on the router's spine (never inside a packed box), or
  // the layered layout above cannot see that end.
  const pinned = new Map<string, Set<string>>();
  const pin = (endpoint: string, lca: string) => {
    for (let cur = byId.get(endpoint); cur && parentOf(cur) !== lca; cur = byId.get(parentOf(cur))) {
      const level = parentOf(cur);
      (pinned.get(level) ?? pinned.set(level, new Set()).get(level)!).add(cur.id);
    }
  };
  ir.edges.forEach((e, i) => {
    if (!elkNodes.has(e.from) || !elkNodes.has(e.to)) return;
    // an edge between a node and its own container is not a graph edge
    // for the router: it is drawn as a straight anchored line instead
    if (isAncestor(e.from, e.to) || isAncestor(e.to, e.from)) return;
    const level = lcaOf(e.from, e.to);
    (edgesAt.get(level) ?? edgesAt.set(level, []).get(level)!).push(i);
    pin(e.from, level);
    pin(e.to, level);
  });
  const edgeHome = new Map<number, string>();
  const elkEdge = (i: number): ElkExtendedEdge => {
    const edge = ir.edges[i];
    const up = UPWARD.has(edge.kind);
    return {
      id: `e${i}`,
      sources: [up ? edge.to : edge.from],
      targets: [up ? edge.from : edge.to],
      labels: edge.label ? [{ text: edge.label, width: edge.label.length * LABEL_CHAR_W + 8, height: LABEL_H }] : undefined,
    } as ElkExtendedEdge;
  };
  const root: ElkNode = { id: "root", layoutOptions: LAYOUT_OPTIONS, children: [], edges: [] };

  const place = (level: string, host: ElkNode) => {
    const children = kids.get(level) ?? [];
    const edges = edgesAt.get(level) ?? [];
    // union-find over the level's children by the edges crossing between them
    const rep = new Map<string, string>(children.map((c) => [c.id, c.id]));
    const find = (x: string): string => (rep.get(x) === x ? x : (rep.set(x, find(rep.get(x)!)), rep.get(x)!));
    const linked = new Set<string>();
    for (const i of edges) {
      const a = childAt(ir.edges[i].from, level);
      const b = childAt(ir.edges[i].to, level);
      if (!a || !b) continue;
      linked.add(a);
      linked.add(b);
      if (a !== b) rep.set(find(a), find(b));
    }
    const groups = new Map<string, IrNode[]>();
    for (const c of children) (groups.get(find(c.id)) ?? groups.set(find(c.id), []).get(find(c.id))!).push(c);
    const pinnedHere = pinned.get(level) ?? new Set<string>();
    const spine = new Set<string>(); // children that stay directly under the host
    for (const g of groups.values()) if (g.some((c) => pinnedHere.has(c.id))) for (const c of g) spine.add(c.id);
    const loose = children.filter((c) => !linked.has(c.id) && !spine.has(c.id));
    const components = [...groups.values()].filter((g) => g.some((c) => linked.has(c.id)) && !spine.has(g[0].id));
    const pieces = components.length + loose.length;
    if (pieces <= 1 || (spine.size === 0 && components.length === 1 && loose.length === 0)) {
      // one piece: the host's own layered layout handles it
      for (const c of children) host.children!.push(elkNodes.get(c.id)!);
      for (const i of edges) {
        host.edges!.push(elkEdge(i));
        edgeHome.set(i, host.id);
      }
    } else {
      for (const c of children) if (spine.has(c.id)) host.children!.push(elkNodes.get(c.id)!);
      for (const i of edges) {
        const a = childAt(ir.edges[i].from, level);
        if (a && spine.has(a)) {
          host.edges!.push(elkEdge(i));
          edgeHome.set(i, host.id);
        }
      }
      const pack: ElkNode = {
        id: `${host.id}${PACK_SUFFIX}`,
        children: [],
        layoutOptions: { "elk.algorithm": "rectpacking", "elk.aspectRatio": "1.6", "elk.spacing.nodeNode": String(GAP_X), "elk.padding": "[top=0,left=0,bottom=0,right=0]" },
      };
      host.children!.push(pack);
      components.forEach((group, k) => {
        const comp: ElkNode = {
          id: `${host.id}${PACK_SUFFIX}${k}`,
          children: group.map((c) => elkNodes.get(c.id)!),
          edges: [],
          layoutOptions: { ...LAYOUT_OPTIONS, "elk.padding": "[top=0,left=0,bottom=0,right=0]" },
        };
        const members = new Set(group.map((c) => c.id));
        for (const i of edges) {
          const a = childAt(ir.edges[i].from, level);
          if (a && members.has(a)) {
            comp.edges!.push(elkEdge(i));
            edgeHome.set(i, comp.id);
          }
        }
        pack.children!.push(comp);
      });
      for (const c of loose) pack.children!.push(elkNodes.get(c.id)!);
    }
    for (const c of children) if (c.kind === "container") place(c.id, elkNodes.get(c.id)!);
  };
  place("root", root);
  return { root, edgeHome };
}

/** Absolute (rounded) positions of every laid-out node. */
function absolutePositions(root: ElkNode): Map<string, { x: number; y: number; w: number; h: number }> {
  const out = new Map<string, { x: number; y: number; w: number; h: number }>();
  const walk = (node: ElkNode, ox: number, oy: number) => {
    for (const child of node.children ?? []) {
      const x = ox + (child.x ?? 0);
      const y = oy + (child.y ?? 0);
      out.set(child.id, { x: Math.round(x), y: Math.round(y), w: Math.round(child.width ?? 0), h: Math.round(child.height ?? 0) });
      walk(child, x, y);
    }
  };
  walk(root, PAD, PAD);
  return out;
}

async function layout(ir: RenderIr): Promise<{ placed: Placed[]; routes: Map<number, Route> }> {
  const { root, edgeHome } = toElk(ir);
  const laid = await elk.layout(root);
  const abs = absolutePositions(laid);
  const seen = new Set<string>();
  const placed: Placed[] = [];
  // children before their container (deepest containers first), as
  // applyDeltas/adaptContainers expect; emit() paints them shallow-first.
  const containerDepth = (n: IrNode) => {
    let d = 0;
    for (let id = n.parent; id; id = ir.nodes.find((m) => m.id === id)?.parent) d++;
    return d;
  };
  const order = [
    ...ir.nodes.filter((n) => n.kind !== "container"),
    ...ir.nodes.filter((n) => n.kind === "container").sort((a, b) => containerDepth(b) - containerDepth(a)),
  ];
  for (const node of order) {
    const at = abs.get(node.id);
    if (!at || seen.has(node.id)) continue;
    seen.add(node.id);
    placed.push({ node, x: at.x, y: at.y, w: at.w, h: at.h });
  }
  const routes = new Map<number, Route>();
  const laidEdges: ElkExtendedEdge[] = [];
  const collect = (node: ElkNode) => {
    laidEdges.push(...((node.edges ?? []) as ElkExtendedEdge[]));
    for (const child of node.children ?? []) collect(child);
  };
  collect(laid);
  for (const edge of laidEdges) {
    const index = Number(edge.id.slice(1));
    const original = ir.edges[index];
    const section = edge.sections?.[0];
    if (!original || !section) continue;
    const home = edgeHome.get(index);
    const origin = home && abs.get(home) ? abs.get(home)! : { x: PAD, y: PAD };
    const shift = (p: { x: number; y: number }) => ({ x: Math.round(origin.x + p.x), y: Math.round(origin.y + p.y) });
    let points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(shift);
    if (UPWARD.has(original.kind)) points = points.reverse(); // drawn from subtype to base
    const label = edge.labels?.[0];
    routes.set(index, {
      points,
      label: label && label.x !== undefined && label.y !== undefined ? shift({ x: label.x, y: label.y + LABEL_H - 3 }) : undefined,
    });
  }
  return { placed, routes };
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

function emitEdge(edge: IrEdge, byId: Map<string, Placed>, px: string, route?: Route): { path: string; label: string } {
  const from = byId.get(edge.from);
  const to = byId.get(edge.to);
  if (!from || !to) return { path: "", label: "" };
  const routed = route && route.points.length >= 2 ? route.points : [anchor(from, to), anchor(to, from)];
  // The diamond of a composition or an aggregation sits on the whole — the
  // edge's source in PlantUML (`A *-- B`) — so those paths are drawn from
  // the part to the whole and the end marker lands on the right box.
  const points = DIAMOND.has(edge.kind) ? [...routed].reverse() : routed;
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const marker = MARKER_BY_KIND[edge.kind];
  const markerAttr = marker ? ` marker-end="url(#${px}${marker})"` : "";
  let label = "";
  if (edge.label) {
    let at = route?.label;
    if (!at) {
      // no routed label: beside the midpoint of the longest segment
      let best = 0;
      for (let i = 1; i < points.length; i++) {
        const len = Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
        if (len > Math.abs(points[best + 1]?.x - points[best].x) + Math.abs(points[best + 1]?.y - points[best].y)) best = i - 1;
      }
      const a = points[best];
      const b = points[best + 1] ?? a;
      at = { x: Math.round((a.x + b.x) / 2) + 6, y: Math.round((a.y + b.y) / 2) - 4 };
    }
    label = `<text class="pr-edge-label" x="${at.x}" y="${at.y}">${esc(edge.label)}</text>`;
  }
  const path = `<path class="pr-edge pr-edge-${edge.kind}" data-from="${esc(edge.from)}" data-to="${esc(edge.to)}" d="${d}"${markerAttr}${refAttrs(edge.refs)}>${tooltip(edge.title)}</path>`;
  return { path: linked(edge.href, path), label };
}

function emit(ir: RenderIr, placed: Placed[], routes: Map<number, Route>): string {
  // The frame is the content's bounding box plus PAD on every side.
  // The frame is the bounding box of the nodes and of the routed edges,
  // with the same pad on every side.
  const xs = [...placed.map((p) => p.x), ...placed.map((p) => p.x + p.w)];
  const ys = [...placed.map((p) => p.y), ...placed.map((p) => p.y + p.h)];
  for (const route of routes.values()) for (const p of route.points) { xs.push(p.x); ys.push(p.y); }
  const minX = (xs.length ? Math.min(...xs) : 0) - PAD;
  const minY = (ys.length ? Math.min(...ys) : 0) - PAD;
  const width = (xs.length ? Math.max(...xs) : 10) + PAD - minX;
  const height = (ys.length ? Math.max(...ys) : 10) + PAD - minY;
  const byId = new Map(placed.map((p) => [p.node.id, p]));
  const containers = placed.filter((p) => p.node.kind === "container");
  const leaves = placed.filter((p) => p.node.kind !== "container");
  const px = idPrefix(ir.title);
  // Paint order (REQ-00016-1): containers parent-first (placed lists a
  // subtree before its frame, so reversing paints the outer frame under
  // the inner ones), then edges, then leaves, then edge labels so no box
  // covers a label.
  const edges = ir.edges.map((e, i) => emitEdge(e, byId, px, routes.get(i)));
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
