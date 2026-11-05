// @covers render.ir.validateIr
import { describe, expect, it } from "vitest";

import { IrValidationError, type RenderIr, validateIr } from "../../src/render/ir.js";

const minimal = (): RenderIr => ({ ir: 1, nodes: [], edges: [] });
const withNode = (node: unknown) => ({ ...minimal(), nodes: [node] });
const withEdge = (edge: unknown) => ({ ...minimal(), edges: [edge] });
const box = { id: "A", kind: "box", label: "A" };

describe("validateIr", () => {
  it("returns the very document it was given when valid", () => {
    const ir = minimal();
    expect(validateIr(ir)).toBe(ir);
  });

  it("accepts a document using the optional fields", () => {
    const ir = {
      ir: 1,
      title: "t",
      notice: "not drawn",
      nodes: [
        { id: "pkg", kind: "container", label: "pkg" },
        {
          id: "A",
          kind: "box",
          label: "A",
          parent: "pkg",
          classifier: "class",
          abstract: true,
          sections: [["+a"], ["+b()"]],
          sectionKinds: ["attributes", "methods"],
          href: "#a",
          title: "tip",
          refs: { reqs: ["R1", "R2"], code: "a.ts" },
        },
        { id: "p", kind: "port", label: "in", parent: "A", direction: "in", side: "west" },
      ],
      edges: [{ from: "A", to: "pkg", kind: "dependency", label: "uses", href: "#e", refs: { reqs: "R1" } }],
    };
    expect(validateIr(ir)).toBe(ir);
  });

  it.each([
    ["null", null],
    ["a string", "{}"],
    ["an array", []],
    ["an empty object", {}],
    ["no nodes", { ir: 1, edges: [] }],
    ["no edges", { ir: 1, nodes: [] }],
    ["another contract version", { ir: 2, nodes: [], edges: [] }],
    ["an unknown root field", { ...minimal(), extra: true }],
    ["an empty notice", { ...minimal(), notice: "" }],
    ["nodes not a list", { ir: 1, nodes: {}, edges: [] }],
  ])("rejects %s", (_, value) => {
    expect(() => validateIr(value)).toThrow(IrValidationError);
  });

  it.each([
    ["no id", { kind: "box", label: "A" }],
    ["an empty id", { ...box, id: "" }],
    ["no label", { id: "A", kind: "box" }],
    ["an unknown kind", { ...box, kind: "blob" }],
    ["an unknown field", { ...box, color: "red" }],
    ["an unknown section kind", { ...box, sections: [["x"]], sectionKinds: ["fields"] }],
    ["sections that are not lists of text", { ...box, sections: ["x"] }],
    ["an empty href", { ...box, href: "" }],
    ["a ref key out of format", { ...box, refs: { Reqs: "R" } }],
    ["a span of the wrong length", { ...box, kind: "frame", span: [1] }],
    ["a negative row", { ...box, at: -1 }],
    ["an unknown port side", { ...box, kind: "port", side: "up" }],
  ])("rejects a node with %s", (_, node) => {
    expect(() => validateIr(withNode(node))).toThrow(IrValidationError);
  });

  it.each([
    ["no from", { to: "A", kind: "association" }],
    ["no to", { from: "A", kind: "association" }],
    ["an unknown kind", { from: "A", to: "B", kind: "arrow" }],
    ["an unknown field", { from: "A", to: "B", kind: "association", weight: 1 }],
  ])("rejects an edge with %s", (_, edge) => {
    expect(() => validateIr(withEdge(edge))).toThrow(IrValidationError);
  });

  it("requires a row on a message, and only on a message", () => {
    expect(() => validateIr(withEdge({ from: "A", to: "B", kind: "message" }))).toThrow(IrValidationError);
    expect(() => validateIr(withEdge({ from: "A", to: "B", kind: "message", order: 0 }))).not.toThrow();
    expect(() => validateIr(withEdge({ from: "A", to: "B", kind: "flow" }))).not.toThrow();
  });

  it("says where and what in the error message", () => {
    expect(() => validateIr(withNode({ ...box, kind: "blob" }))).toThrow(
      /^invalid render-IR: \/nodes\/0\/kind must be equal to one of the allowed values/,
    );
  });

  it("names the root as / when the root itself is at fault", () => {
    expect(() => validateIr({})).toThrow(/^invalid render-IR: \/ must have required property/);
  });

  it("throws an Error subclass a caller can tell apart", () => {
    let caught: unknown;
    try {
      validateIr(null);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(IrValidationError);
    expect(caught).toBeInstanceOf(Error);
  });
});
