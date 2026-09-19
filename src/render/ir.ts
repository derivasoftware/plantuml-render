/**
 * render-IR: the engine's public input contract.
 *
 * The normative definition is schema/render-ir.schema.json; these types
 * mirror it and `validateIr` enforces it strictly — invalid IR is an
 * error, never a best-effort drawing.
 */

import compiledValidate from "./validate.gen.js";

export type NodeKind =
  | "box"
  | "container"
  | "note"
  | "lifeline"
  | "frame"
  | "divider";

export type EdgeKind =
  | "inheritance"
  | "realization"
  | "composition"
  | "aggregation"
  | "dependency"
  | "association"
  | "attachment"
  | "message";

/** Navigation hooks a producer may attach to a node or an edge. */
export interface IrLinks {
  /** Link target; the engine wraps the element in `<a href>`. */
  href?: string;
  /** Tooltip; emitted as the element's `<title>`. */
  title?: string;
  /** References for a host page (reqs, code, tests, diagrams …), emitted
   * as `data-ref-<key>` attributes; a list joins with spaces. */
  refs?: Record<string, string | string[]>;
}

export interface IrNode extends IrLinks {
  id: string;
  kind: NodeKind;
  label: string;
  classifier?: string;
  stereotype?: string;
  abstract?: boolean;
  sections?: string[][];
  parent?: string;
  /** Sequence row this node occupies (dividers, anchored notes). */
  at?: number;
  /** Lifeline id an anchored note attaches to. */
  anchor?: string;
  /** Inclusive [first, last] row range a frame covers. */
  span?: [number, number];
  /** Frame-internal section boundaries (else clauses). */
  dividers?: { at: number; label: string }[];
}

export interface IrEdge extends IrLinks {
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
  /** Sequence row of a message; required when kind is "message". */
  order?: number;
  /** Dashed message core (responses, PlantUML `-->`). */
  dashed?: boolean;
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
