import { describe, expect, it } from "vitest";

import { renderSvg } from "../src/render/engine.js";
import { type RenderIr } from "../src/render/ir.js";

const box = (id: string, extra: Record<string, unknown> = {}) => ({ id, kind: "box" as const, label: id.split(".").pop()!, ...extra });
const rectOf = (svg: string, id: string) => {
  const m = svg.match(new RegExp(`data-id="${id.replace(/\./g, "\\.")}"[^>]*>(?:<title>[^<]*</title>)?<rect x="(-?\\d+)" y="(-?\\d+)" width="(\\d+)" height="(\\d+)"`));
  if (!m) throw new Error(`no rect for ${id}`);
  const [x, y, w, h] = m.slice(1).map(Number);
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
};
const pathOf = (svg: string, from: string, to: string) => {
  const m = svg.match(new RegExp(`data-from="${from}" data-to="${to}" d="([^"]+)"`));
  if (!m) throw new Error(`no edge ${from}->${to}`);
  return m[1].split(" ").map((t) => t.slice(1).split(",").map(Number)) as [number, number][];
};
const viewBox = (svg: string) => svg.match(/viewBox="(-?\d+) (-?\d+) (\d+) (\d+)"/)!.slice(1).map(Number);
const inside = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;

describe("class layout", () => {
  it("puts bases above subtypes and interfaces above their implementations", async () => {
    const ir: RenderIr = {
      ir: 1,
      nodes: [box("Base"), box("Mid"), box("Leaf"), box("Iface", { classifier: "interface" }), box("Impl")],
      edges: [
        { from: "Mid", to: "Base", kind: "inheritance" },
        { from: "Leaf", to: "Mid", kind: "inheritance" },
        { from: "Impl", to: "Iface", kind: "realization" },
      ],
    };
    const svg = await renderSvg(ir);
    expect(rectOf(svg, "Base").y).toBeLessThan(rectOf(svg, "Mid").y);
    expect(rectOf(svg, "Mid").y).toBeLessThan(rectOf(svg, "Leaf").y);
    expect(rectOf(svg, "Iface").y).toBeLessThan(rectOf(svg, "Impl").y);
  });

  it("routes edges orthogonally between the boxes they join", async () => {
    const ir: RenderIr = {
      ir: 1,
      nodes: [box("A"), box("B"), box("C")],
      edges: [{ from: "A", to: "B", kind: "association", label: "uses" }, { from: "A", to: "C", kind: "dependency" }],
    };
    const svg = await renderSvg(ir);
    for (const [from, to] of [["A", "B"], ["A", "C"]]) {
      const points = pathOf(svg, from, to);
      expect(points.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < points.length; i++) {
        // every segment is horizontal or vertical
        expect(points[i][0] === points[i - 1][0] || points[i][1] === points[i - 1][1]).toBe(true);
      }
      const a = rectOf(svg, from);
      const b = rectOf(svg, to);
      const [sx, sy] = points[0];
      const [ex, ey] = points[points.length - 1];
      expect(sx >= a.x && sx <= a.x + a.w && sy >= a.y && sy <= a.y + a.h).toBe(true);
      expect(ex >= b.x && ex <= b.x + b.w && ey >= b.y && ey <= b.y + b.h).toBe(true);
    }
    expect(svg).toMatch(/class="pr-edge-label" x="\d+" y="\d+">uses</);
  });

  it("packs disconnected boxes into a grid instead of one row", async () => {
    const ir: RenderIr = { ir: 1, nodes: Array.from({ length: 12 }, (_, i) => box(`Loose${i}`, { sections: [["+ a : int"]] })), edges: [] };
    const [, , w, h] = viewBox(await renderSvg(ir));
    expect(w / h).toBeLessThan(3);
    expect(w / h).toBeGreaterThan(0.6);
  });

  it("lays containers out with their children and routes across them", async () => {
    const ir: RenderIr = {
      ir: 1,
      nodes: [
        { id: "a", kind: "container", label: "a" },
        { id: "a.x", kind: "container", label: "x", parent: "a" },
        { id: "a.y", kind: "container", label: "y", parent: "a" },
        box("a.x.P", { parent: "a.x" }),
        box("a.x.Q", { parent: "a.x" }),
        box("a.y.R", { parent: "a.y" }),
        box("a.y.S", { parent: "a.y" }),
        box("Out"),
      ],
      edges: [
        { from: "a.x.P", to: "a.y.R", kind: "dependency" },
        { from: "a.x.Q", to: "a.x.P", kind: "inheritance" },
        { from: "Out", to: "a.y.S", kind: "association" },
      ],
    };
    const svg = await renderSvg(ir);
    const a = rectOf(svg, "a");
    const x = rectOf(svg, "a.x");
    const y = rectOf(svg, "a.y");
    expect(inside(x, a) && inside(y, a)).toBe(true);
    for (const id of ["a.x.P", "a.x.Q"]) expect(inside(rectOf(svg, id), x)).toBe(true);
    for (const id of ["a.y.R", "a.y.S"]) expect(inside(rectOf(svg, id), y)).toBe(true);
    expect(pathOf(svg, "a.x.P", "a.y.R").length).toBeGreaterThanOrEqual(2);
    expect(pathOf(svg, "Out", "a.y.S").length).toBeGreaterThanOrEqual(2);
    expect(rectOf(svg, "a.x.P").y).toBeLessThan(rectOf(svg, "a.x.Q").y);
  });

  it("ends a composition or aggregation path on the whole, where the diamond belongs", async () => {
    const ir: RenderIr = {
      ir: 1,
      nodes: [box("Whole"), box("Part"), box("Owner"), box("Item")],
      edges: [{ from: "Whole", to: "Part", kind: "composition" }, { from: "Owner", to: "Item", kind: "aggregation" }],
    };
    const svg = await renderSvg(ir);
    for (const [whole, part] of [["Whole", "Part"], ["Owner", "Item"]]) {
      const points = pathOf(svg, whole, part);
      const [ex, ey] = points[points.length - 1];
      const w = rectOf(svg, whole);
      expect(ex >= w.x && ex <= w.x + w.w && ey >= w.y && ey <= w.y + w.h).toBe(true);
    }
  });

  it("draws an edge to the node's own container as a straight line and stays deterministic", async () => {
    const ir: RenderIr = {
      ir: 1,
      nodes: [{ id: "ns", kind: "container", label: "ns" }, box("ns.A", { parent: "ns" }), box("ns.B", { parent: "ns" })],
      edges: [{ from: "ns.A", to: "ns", kind: "dependency" }, { from: "ns.A", to: "ns.B", kind: "association" }],
    };
    const svg = await renderSvg(ir);
    expect(pathOf(svg, "ns.A", "ns")).toHaveLength(2);
    expect(await renderSvg(ir)).toBe(svg);
  });
});
