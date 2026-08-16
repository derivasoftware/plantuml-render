import { describe, expect, it } from "vitest";

import { IrValidationError, validateIr } from "../src/render/ir.js";

const MINIMAL = { ir: 1, nodes: [], edges: [] };

describe("render-IR validation", () => {
  it("accepts a minimal document", () => {
    expect(validateIr(MINIMAL)).toEqual(MINIMAL);
  });

  it("rejects unknown node kinds", () => {
    const bad = {
      ir: 1,
      nodes: [{ id: "a", kind: "blob", label: "A" }],
      edges: [],
    };
    expect(() => validateIr(bad)).toThrow(IrValidationError);
  });

  it("rejects unknown edge kinds and extra fields", () => {
    expect(() =>
      validateIr({
        ir: 1,
        nodes: [],
        edges: [{ from: "a", to: "b", kind: "friendship" }],
      }),
    ).toThrow(IrValidationError);
    expect(() => validateIr({ ...MINIMAL, extra: true })).toThrow(
      IrValidationError,
    );
  });

  it("rejects a wrong contract version", () => {
    expect(() => validateIr({ ir: 2, nodes: [], edges: [] })).toThrow(
      IrValidationError,
    );
  });
});
