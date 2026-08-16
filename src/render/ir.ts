/**
 * render-IR: the engine's public input contract.
 *
 * The normative definition is schema/render-ir.schema.json; these types
 * mirror it and `validateIr` enforces it strictly — invalid IR is an
 * error, never a best-effort drawing.
 */

import compiledValidate from "./validate.gen.js";

export type NodeKind = "box" | "container" | "note";

export type EdgeKind =
  | "inheritance"
  | "realization"
  | "composition"
  | "aggregation"
  | "dependency"
  | "association"
  | "attachment";

export interface IrNode {
  id: string;
  kind: NodeKind;
  label: string;
  classifier?: string;
  stereotype?: string;
  abstract?: boolean;
  sections?: string[][];
  parent?: string;
}

export interface IrEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
}

export interface RenderIr {
  ir: 1;
  title?: string;
  nodes: IrNode[];
  edges: IrEdge[];
}

export class IrValidationError extends Error {}

export function validateIr(value: unknown): RenderIr {
  if (!compiledValidate(value)) {
    const detail = (compiledValidate.errors ?? [])
      .map((e) => `${e.instancePath || "/"} ${e.message}`)
      .join("; ");
    throw new IrValidationError(`invalid render-IR: ${detail}`);
  }
  return value as RenderIr;
}
