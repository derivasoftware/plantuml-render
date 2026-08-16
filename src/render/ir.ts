/**
 * render-IR: the engine's public input contract.
 *
 * The normative definition is schema/render-ir.schema.json; these types
 * mirror it and `validateIr` enforces it strictly — invalid IR is an
 * error, never a best-effort drawing.
 */

import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";

import { RENDER_IR_SCHEMA } from "./schema.gen.js";

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

let compiled: ValidateFunction | undefined;

function validator(): ValidateFunction {
  if (!compiled) {
    compiled = new Ajv({ allErrors: true }).compile(
      RENDER_IR_SCHEMA as unknown as object,
    );
  }
  return compiled;
}

export class IrValidationError extends Error {}

export function validateIr(value: unknown): RenderIr {
  const check = validator();
  if (!check(value)) {
    const detail = (check.errors ?? [])
      .map((e) => `${e.instancePath || "/"} ${e.message}`)
      .join("; ");
    throw new IrValidationError(`invalid render-IR: ${detail}`);
  }
  return value as RenderIr;
}
