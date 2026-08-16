/**
 * POC: pure IR→IR view filters. Environment-neutral — the same filters
 * serve the text preview and any model-projected IR.
 */

import { type RenderIr } from "./ir.js";

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
