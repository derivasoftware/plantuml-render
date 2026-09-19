import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { main } from "../src/render/cli.js";
import { renderSvg } from "../src/render/engine.js";
import { IrValidationError, validateIr } from "../src/render/ir.js";
import { applyLinks } from "../src/render/links.js";
import { renderSequenceSvg } from "../src/render/sequence.js";

const ir = () => ({
  ir: 1 as const,
  title: "CL_L",
  nodes: [
    { id: "ns", kind: "container" as const, label: "ns" },
    { id: "ns.Order", kind: "box" as const, label: "Order", parent: "ns", href: "#cls-ns-Order", title: "The order", refs: { reqs: ["REQ-1", "REQ-2"], code: "src/ns/order.py" } },
    { id: "ns.Line", kind: "box" as const, label: "Line", parent: "ns" },
    { id: "other.Line", kind: "box" as const, label: "Line", parent: "ns" },
  ],
  edges: [{ from: "ns.Order", to: "ns.Line", kind: "composition" as const, href: "#rel-1", title: "owns", refs: { kind: "composition" } }],
});

describe("links", () => {
  it("accepts href, title and refs on nodes and edges and rejects malformed refs", () => {
    expect(validateIr(ir())).toBeTruthy();
    expect(() => validateIr({ ir: 1, nodes: [{ id: "a", kind: "box", label: "A", refs: { "Bad Key": "x" } }], edges: [] })).toThrow(IrValidationError);
    expect(() => validateIr({ ir: 1, nodes: [{ id: "a", kind: "box", label: "A", href: "" }], edges: [] })).toThrow(IrValidationError);
  });

  it("wraps linked elements in <a href>, adds the tooltip and the data-ref attributes", () => {
    const svg = renderSvg(ir());
    expect(svg).toMatch(/<a href="#cls-ns-Order" class="pr-link"><g id="[^"]+" data-id="ns.Order"[^>]*data-ref-reqs="REQ-1 REQ-2" data-ref-code="src\/ns\/order.py"><title>The order<\/title>/);
    expect(svg).toMatch(/<a href="#rel-1" class="pr-link"><path class="pr-edge pr-edge-composition"[^>]*data-ref-kind="composition"><title>owns<\/title><\/path><\/a>/);
    expect(svg).not.toMatch(/data-id="ns.Line"[^>]*data-ref/);
    expect(renderSvg(ir())).toBe(renderSvg(ir()));
  });

  it("links sequence participants and messages the same way", () => {
    const svg = renderSequenceSvg({
      ir: 1,
      title: "SEQ_L",
      nodes: [
        { id: "A", kind: "lifeline", label: "A", classifier: "participant", href: "#cls-A", refs: { diagram: "CL_A" } },
        { id: "B", kind: "lifeline", label: "B", classifier: "participant" },
      ],
      edges: [{ from: "A", to: "B", kind: "message", label: "go()", order: 0, href: "#m", title: "call" }],
    });
    expect(svg).toMatch(/<a href="#cls-A" class="pr-link"><g id="[^"]+" data-id="A"[^>]*data-ref-diagram="CL_A">/);
    expect(svg).toMatch(/<a href="#m" class="pr-link"><path class="pr-msg"[^>]*><title>call<\/title><\/path><\/a>/);
  });

  it("applies a map by id, by unique short name, and a template to the rest", () => {
    const base = { ir: 1 as const, nodes: [
      { id: "a.X", kind: "box" as const, label: "X" },
      { id: "a.Y", kind: "box" as const, label: "Y", href: "#kept" },
      { id: "b.Line", kind: "box" as const, label: "Line" },
      { id: "c.Line", kind: "box" as const, label: "Line" },
      { id: "note-1", kind: "note" as const, label: "n" },
    ], edges: [] };
    const out = applyLinks(base, { map: { "a.X": "#x", Y: { href: "#y", refs: { reqs: "REQ-9" } }, Line: "#ambiguous" }, template: "https://d/{id}?n={name}" });
    const by = Object.fromEntries(out.nodes.map((n) => [n.id, n]));
    expect(by["a.X"].href).toBe("#x");
    expect(by["a.Y"]).toMatchObject({ href: "#y", refs: { reqs: "REQ-9" } });
    expect(by["b.Line"].href).toBe("https://d/b.Line?n=Line");
    expect(by["c.Line"].href).toBe("https://d/c.Line?n=Line");
    expect(by["note-1"].href).toBeUndefined();
    expect(applyLinks(base, {}).nodes).toEqual(base.nodes);
  });
});

describe("link options", () => {
  it("decorates from --links and --link-template in the puml and --ir forms", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pr-links-"));
    writeFileSync(join(dir, "CL_A.puml"), "@startuml CL_A\nnamespace ns {\n  class Order\n  class Line\n}\n@enduml\n");
    writeFileSync(join(dir, "links.json"), JSON.stringify({ "ns.Order": { href: "#cls-Order", title: "Order", refs: { reqs: ["REQ-1"] } } }));
    writeFileSync(join(dir, "model.json"), JSON.stringify({ ir: 1, title: "M", nodes: [{ id: "q.Z", kind: "box", label: "Z" }], edges: [] }));
    let out = "";
    const io = { stdout: (t: string) => (out += t), stderr: () => {} };
    out = "";
    expect(await main([join(dir, "CL_A.puml"), "--links", join(dir, "links.json"), "--link-template", "https://docs/{name}"], io)).toBe(0);
    expect(out).toContain('<a href="#cls-Order" class="pr-link">');
    expect(out).toContain('data-ref-reqs="REQ-1"');
    expect(out).toContain('<a href="https://docs/Line" class="pr-link">');
    out = "";
    expect(await main(["--ir", join(dir, "model.json"), "--link-template", "/e/{id}"], io)).toBe(0);
    expect(out).toContain('<a href="/e/q.Z" class="pr-link">');
  });
});
