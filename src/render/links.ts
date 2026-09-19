/**
 * Link decoration (REQ-00018-1): attach `href`, `title` and `refs` to the
 * entities of a render-IR document from a map keyed by entity id or from a
 * template, so a diagram navigates without its producer knowing where the
 * targets live. Pure IR→IR, environment-neutral, deterministic.
 */

import { type IrLinks, type IrNode, type RenderIr } from "./ir.js";

/** A map entry: a bare URL, or the full link fields. */
export type LinkEntry = string | IrLinks;

export interface LinkSpec {
  /** Entity id (or unique short name) → link. Entries override the IR. */
  map?: Record<string, LinkEntry>;
  /** `href` for every entity without one; `{id}` and `{name}` expand. */
  template?: string;
}

const LINKABLE = new Set(["box", "lifeline", "container"]);

const shortName = (id: string) => id.split(".").pop() ?? id;

function entryFor(node: IrNode, map: Record<string, LinkEntry>, byShort: Map<string, string[]>): IrLinks | undefined {
  const exact = map[node.id];
  if (exact !== undefined) return typeof exact === "string" ? { href: exact } : exact;
  const owners = byShort.get(shortName(node.id));
  if (owners && owners.length === 1 && owners[0] === node.id && map[shortName(node.id)] !== undefined) {
    const entry = map[shortName(node.id)];
    return typeof entry === "string" ? { href: entry } : entry;
  }
  return undefined;
}

export function applyLinks(ir: RenderIr, spec: LinkSpec): RenderIr {
  const map = spec.map ?? {};
  const byShort = new Map<string, string[]>();
  for (const n of ir.nodes) {
    const s = shortName(n.id);
    byShort.set(s, [...(byShort.get(s) ?? []), n.id]);
  }
  const expand = (node: IrNode) =>
    spec.template!.replaceAll("{id}", encodeURIComponent(node.id)).replaceAll("{name}", encodeURIComponent(shortName(node.id)));
  return {
    ...ir,
    nodes: ir.nodes.map((node) => {
      if (!LINKABLE.has(node.kind)) return node;
      const entry = entryFor(node, map, byShort);
      const next: IrNode = { ...node, ...(entry ?? {}) };
      if (entry?.refs && node.refs) next.refs = { ...node.refs, ...entry.refs };
      if (!next.href && spec.template) next.href = expand(node);
      return next;
    }),
  };
}
