import { describe, expect, it } from "vitest";

import { renderSvg } from "../src/render/engine.js";
import { pumlToIr } from "../src/render/frontend.js";

const IR = {
  ir: 1 as const,
  nodes: [
    { id: "ns", kind: "container" as const, label: "ns" },
    { id: "ns.A", kind: "box" as const, label: "A", parent: "ns" },
    { id: "ns.B", kind: "box" as const, label: "B", parent: "ns" },
  ],
  edges: [{ from: "ns.A", to: "ns.B", kind: "association" as const }],
};

function rectOf(svg: string, id: string): { x: number; y: number; w: number; h: number } {
  const m = svg.match(
    new RegExp(`id="${id}"[^>]*>\\s*<rect x="(-?\\d+)" y="(-?\\d+)" width="(\\d+)" height="(\\d+)"`),
  );
  if (!m) throw new Error(`no rect for ${id}`);
  return { x: +m[1], y: +m[2], w: +m[3], h: +m[4] };
}

describe("interactive rendering", () => {
  it("edges carry endpoint data attributes", () => {
    expect(renderSvg(IR)).toContain('data-from="ns.A" data-to="ns.B"');
  });

  it("leaf deltas move the node and its container adapts around it", () => {
    const svg = renderSvg(IR, { positions: { "ns.A": { dx: 300, dy: 200 } } });
    const a = rectOf(svg, "ns.A");
    const ns = rectOf(svg, "ns");
    expect(a.x).toBeGreaterThan(250);
    expect(ns.x + ns.w).toBeGreaterThanOrEqual(a.x + a.w);
    expect(ns.y + ns.h).toBeGreaterThanOrEqual(a.y + a.h);
  });

  it("container deltas cascade to the whole subtree", () => {
    const base = rectOf(renderSvg(IR), "ns.B");
    const svg = renderSvg(IR, { positions: { ns: { dx: 100, dy: 50 } } });
    const moved = rectOf(svg, "ns.B");
    expect(moved.x - base.x).toBe(100);
    expect(moved.y - base.y).toBe(50);
  });

  it("negative deltas stay inside the covering viewBox", () => {
    const svg = renderSvg(IR, { positions: { "ns.A": { dx: -500, dy: -400 } } });
    const m = svg.match(/viewBox="(-?\d+) (-?\d+) /);
    expect(Number(m![1])).toBeLessThanOrEqual(-500 + 10);
    expect(Number(m![2])).toBeLessThanOrEqual(-400 + 22);
  });
});

describe("namespace semantics", () => {
  it("reopened namespaces merge into one container", async () => {
    const ir = await pumlToIr(
      "@startuml\nnamespace a.b {\n  class X\n}\nnamespace a.b {\n  class Y\n}\n@enduml\n",
    );
    const containers = ir.nodes.filter((n) => n.kind === "container");
    expect(containers.map((c) => c.id).sort()).toEqual(["a", "a.b"]);
    expect(ir.nodes.filter((n) => n.kind === "box")).toHaveLength(2);
  });

  it("dotted names nest one container per segment sharing prefixes", async () => {
    const ir = await pumlToIr(
      "@startuml\nnamespace a.b.c {\n  class X\n}\nnamespace a.b.d {\n  class Y\n}\n@enduml\n",
    );
    const byId = new Map(ir.nodes.map((n) => [n.id, n]));
    expect(byId.get("a.b.c")?.parent).toBe("a.b");
    expect(byId.get("a.b.d")?.parent).toBe("a.b");
    expect(byId.get("a.b")?.parent).toBe("a");
    expect(byId.get("a.b.c.X")?.parent).toBe("a.b.c");
  });
});
