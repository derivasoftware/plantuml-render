/**
 * POC: pure IR→IR view filters. Environment-neutral — the same filters
 * serve the text preview and any model-projected IR.
 */

import { type IrNode, type RenderIr, type SectionKind } from "./ir.js";

export function stripSections(ir: RenderIr): RenderIr {
  return {
    ...ir,
    nodes: ir.nodes.map((n) => {
      const { sections: _sections, ...rest } = n;
      return rest;
    }),
  };
}

export function flattenContainers(ir: RenderIr): RenderIr {
  const containers = new Set(
    ir.nodes.filter((n) => n.kind === "container").map((n) => n.id),
  );
  return {
    ...ir,
    nodes: ir.nodes
      .filter((n) => n.kind !== "container")
      .map((n) => {
        const { parent: _parent, ...rest } = n;
        return rest;
      }),
    edges: ir.edges.filter(
      (e) => !containers.has(e.from) && !containers.has(e.to),
    ),
  };
}

export function hideNotes(ir: RenderIr): RenderIr {
  const notes = new Set(
    ir.nodes.filter((n) => n.kind === "note").map((n) => n.id),
  );
  return {
    ...ir,
    nodes: ir.nodes.filter((n) => n.kind !== "note"),
    edges: ir.edges.filter((e) => !notes.has(e.from) && !notes.has(e.to)),
  };
}

/** Context a member predicate is given: enough to decide without parsing ids. */
export interface MemberContext {
  /** The node the member belongs to. */
  node: IrNode;
  /** What the compartment holds, when the producer said so. */
  kind?: SectionKind;
  /** The compartment's index in `sections`. */
  section: number;
}

/**
 * Keep the members a predicate accepts; drop the rest, compartments included
 * once they empty.
 *
 * This is the granular half of `stripSections`, which is all or nothing. The
 * fold happens before layout, so boxes shrink instead of leaving the holes a
 * post-render `display:none` leaves behind.
 *
 *     filterMembers(ir, (m) => m.startsWith("+"))              // public only
 *     filterMembers(ir, (_, c) => c.kind !== "methods")        // no methods
 */
export function filterMembers(
  ir: RenderIr,
  keep: (member: string, context: MemberContext) => boolean,
): RenderIr {
  return {
    ...ir,
    nodes: ir.nodes.map((node) => {
      if (!node.sections) return node;
      const kept: string[][] = [];
      const kinds: SectionKind[] = [];
      node.sections.forEach((members, section) => {
        const kind = node.sectionKinds?.[section];
        const left = members.filter((member) =>
          keep(member, { node, kind, section }),
        );
        if (left.length === 0) return;
        kept.push(left);
        if (kind) kinds.push(kind);
      });
      const { sections: _s, sectionKinds: _k, ...rest } = node;
      if (kept.length === 0) return rest;
      return {
        ...rest,
        sections: kept,
        ...(kinds.length === kept.length ? { sectionKinds: kinds } : {}),
      };
    }),
  };
}
