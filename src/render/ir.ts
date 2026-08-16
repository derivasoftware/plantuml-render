/**
 * render-IR: the engine's public input contract.
 *
 * The normative definition is schema/render-ir.schema.json; these types
 * mirror it and `validateIr` enforces it strictly — invalid IR is an
 * error, never a best-effort drawing.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";

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

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(HERE, "..", "..", "schema", "render-ir.schema.json");

let compiled: ValidateFunction | undefined;

function validator(): ValidateFunction {
  if (!compiled) {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
    compiled = new Ajv({ allErrors: true }).compile(schema);
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
