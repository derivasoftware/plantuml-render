// @covers render.engine.absolutePositions, render.engine.adaptContainers, render.engine.anchor, render.engine.applyDeltas
// @covers render.engine.arrowScale, render.engine.bundleParallel, render.engine.classifierOf, render.engine.danglingNotice
// @covers render.engine.emit, render.engine.emitEdge, render.engine.emitNode, render.engine.headerText
// @covers render.engine.labelBox, render.engine.layout, render.engine.layoutLanes, render.engine.markers
// @covers render.engine.nodeSize, render.engine.noteLines, render.engine.renderSvg, render.engine.sideOf
// @covers render.engine.toElk, render.engine.unportedNotice
import { describe, expect, it } from "vitest";

import {
  absolutePositions,
  adaptContainers,
  anchor,
  applyDeltas,
  arrowScale,
  bundleParallel,
  classifierOf,
  danglingNotice,
  emit,
  emitEdge,
  emitNode,
  headerText,
  labelBox,
  layout,
  layoutLanes,
  markers,
  nodeSize,
  noteLines,
  renderSvg,
  sideOf,
  toElk,
  unportedNotice,
} from "../../src/render/engine.js";
import { IrValidationError, type IrEdge, type IrNode, type RenderIr } from "../../src/render/ir.js";

const PACK = "\u0000pack";
const LABEL_OF = "\u0000label";

const box = (id: string, extra: Partial<IrNode> = {}): IrNode => ({ id, kind: "box", label: id, ...extra });
const container = (id: string, extra: Partial<IrNode> = {}): IrNode => ({ id, kind: "container", label: id, ...extra });
const port = (id: string, parent: string, extra: Partial<IrNode> = {}): IrNode => ({
  id,
  kind: "port",
  label: id.split(".").pop()!,
  parent,
  ...extra,
});
const edge = (from: string, to: string, extra: Partial<IrEdge> = {}): IrEdge => ({
  from,
  to,
  kind: "association",
  ...extra,
});
const doc = (nodes: IrNode[], edges: IrEdge[] = [], extra: Partial<RenderIr> = {}): RenderIr => ({
  ir: 1,
  nodes,
  edges,
  ...extra,
});
const at = (node: IrNode, x = 0, y = 0, w = 100, h = 50, label?: { x: number; y: number; w: number; h: number }) => ({
  node,
  x,
  y,
  w,
  h,
  label,
});
const ids = (nodes: { id: string }[] | undefined) => (nodes ?? []).map((n) => n.id);

describe("labelBox", () => {
  it("sizes one line from its length", () => {
    expect(labelBox("abc")).toEqual({ text: "abc", width: 3 * 7 + 8, height: 14 });
  });

  it("takes the widest line and one row per line", () => {
    expect(labelBox("a\nabcd\nab")).toEqual({ text: "a\nabcd\nab", width: 4 * 7 + 8, height: 3 * 14 });
  });

  it("keeps a row for the empty string", () => {
    expect(labelBox("")).toEqual({ text: "", width: 8, height: 14 });
  });
});

describe("bundleParallel", () => {
  it("returns the same document when no relations are parallel", () => {
    const ir = doc([box("a"), box("b")], [edge("a", "b"), edge("b", "a")]);
    expect(bundleParallel(ir)).toBe(ir);
  });

  it("collapses parallels into the first one's slot, one text line each", () => {
    const ir = doc(
      [box("a"), box("b"), box("c")],
      [
        edge("a", "b", { label: "one", title: "why one" }),
        edge("b", "c"),
        edge("a", "b", { label: "two" }),
        edge("a", "b", { title: "why three" }),
      ],
    );
    const { edges } = bundleParallel(ir);
    expect(edges).toHaveLength(2);
    expect(edges[0]).toMatchObject({ from: "a", to: "b", label: "one\ntwo", title: "why one\nwhy three" });
    expect(edges[1]).toBe(ir.edges[1]);
  });

  it("leaves label and title absent when no parallel has one", () => {
    const { edges } = bundleParallel(doc([box("a"), box("b")], [edge("a", "b"), edge("a", "b")]));
    expect(edges).toHaveLength(1);
    expect(edges[0].label).toBeUndefined();
    expect(edges[0].title).toBeUndefined();
  });

  it.each([
    ["kind", { kind: "dependency" as const }],
    ["dash", { dashed: true }],
    ["link", { href: "x.html" }],
  ])("keeps relations apart when their %s differs", (_what, extra) => {
    const ir = doc([box("a"), box("b")], [edge("a", "b"), edge("a", "b", extra)]);
    expect(bundleParallel(ir).edges).toHaveLength(2);
  });

  it("treats a missing dash as an undashed relation", () => {
    const ir = doc([box("a"), box("b")], [edge("a", "b"), edge("a", "b", { dashed: false })]);
    expect(bundleParallel(ir).edges).toHaveLength(1);
  });

  it("never collapses sequence messages, which own their row", () => {
    const m1 = edge("a", "b", { kind: "message", order: 1 });
    const m2 = edge("a", "b", { kind: "message", order: 2 });
    const ir = doc([box("a"), box("b")], [m1, m2, edge("a", "b"), edge("a", "b")]);
    const { edges } = bundleParallel(ir);
    expect(edges).toHaveLength(3);
    expect(edges[0]).toBe(m1);
    expect(edges[1]).toBe(m2);
  });

  it("keeps references only when every parallel agrees on them", () => {
    const same = bundleParallel(
      doc([box("a"), box("b")], [edge("a", "b", { refs: { req: "R1" } }), edge("a", "b", { refs: { req: "R1" } })]),
    );
    expect(same.edges[0].refs).toEqual({ req: "R1" });
    const differ = bundleParallel(
      doc([box("a"), box("b")], [edge("a", "b", { refs: { req: "R1" } }), edge("a", "b", { refs: { req: "R2" } })]),
    );
    expect(differ.edges[0].refs).toBeUndefined();
  });

  it("does not mutate its input", () => {
    const ir = doc([box("a"), box("b")], [edge("a", "b", { label: "x" }), edge("a", "b", { label: "y" })]);
    bundleParallel(ir);
    expect(ir.edges).toHaveLength(2);
    expect(ir.edges[0].label).toBe("x");
  });
});

describe("applyDeltas", () => {
  it("adds a node's own delta and leaves the others alone", () => {
    const a = at(box("a"), 10, 20);
    const b = at(box("b"), 30, 40);
    applyDeltas(doc([a.node, b.node]), [a, b], { a: { dx: 5, dy: -7 } });
    expect([a.x, a.y]).toEqual([15, 13]);
    expect([b.x, b.y]).toEqual([30, 40]);
  });

  it("cascades every ancestor's delta down the subtree", () => {
    const outer = container("outer");
    const inner = container("inner", { parent: "outer" });
    const leaf = box("leaf", { parent: "inner" });
    const placed = [at(leaf, 0, 0), at(inner, 0, 0), at(outer, 0, 0)];
    applyDeltas(doc([outer, inner, leaf]), placed, {
      outer: { dx: 1, dy: 10 },
      inner: { dx: 2, dy: 20 },
      leaf: { dx: 4, dy: 40 },
    });
    expect(placed.map((p) => [p.x, p.y])).toEqual([
      [7, 70],
      [3, 30],
      [1, 10],
    ]);
  });

  it("does not resize anything", () => {
    const a = at(box("a"), 0, 0, 33, 44);
    applyDeltas(doc([a.node]), [a], { a: { dx: 5, dy: 5 } });
    expect([a.w, a.h]).toEqual([33, 44]);
  });
});

describe("adaptContainers", () => {
  it("wraps the children with padding and room for the label", () => {
    const c = at(container("c"), 999, 999, 1, 1);
    const kids = [at(box("a", { parent: "c" }), 100, 200, 50, 30), at(box("b", { parent: "c" }), 300, 250, 40, 20)];
    adaptContainers([...kids, c]);
    expect(c).toMatchObject({ x: 100 - 18, y: 200 - 18 - 22, w: 340 + 18 - (100 - 18), h: 270 + 18 - (200 - 18 - 22) });
  });

  it("never gets narrower than its own label", () => {
    const label = "a-very-long-container-label-here";
    const c = at(container("c", { label }), 0, 0, 1, 1);
    adaptContainers([at(box("a", { parent: "c" }), 100, 100, 10, 10), c]);
    expect(c.w).toBe(label.length * 8 + 16);
  });

  it("leaves an empty container and non-containers untouched", () => {
    const empty = at(container("c"), 1, 2, 3, 4);
    const lone = at(box("a", { parent: "c2" }), 5, 6, 7, 8);
    adaptContainers([empty, lone]);
    expect(empty).toMatchObject({ x: 1, y: 2, w: 3, h: 4 });
    expect(lone).toMatchObject({ x: 5, y: 6, w: 7, h: 8 });
  });

  it("folds bottom-up: an inner container grows before the outer one reads it", () => {
    const leaf = at(box("leaf", { parent: "inner" }), 500, 500, 10, 10);
    const inner = at(container("inner", { parent: "outer" }), 0, 0, 1, 1);
    const outer = at(container("outer"), 0, 0, 1, 1);
    adaptContainers([leaf, inner, outer]);
    expect(inner.x).toBe(482);
    expect(outer.x).toBe(inner.x - 18);
    expect(outer.y).toBe(inner.y - 18 - 22);
    expect(outer.x + outer.w).toBe(inner.x + inner.w + 18);
  });
});

describe("noteLines", () => {
  it("breaks on the PlantUML escape and on a real newline", () => {
    expect(noteLines(box("n", { label: "one\\ntwo\nthree" }))).toEqual(["one", "two", "three"]);
  });

  it("returns a single line when there is nothing to break", () => {
    expect(noteLines(box("n", { label: "only" }))).toEqual(["only"]);
    expect(noteLines(box("n", { label: "" }))).toEqual([""]);
  });
});

describe("headerText", () => {
  it("is the node's label, stereotype and sections left out", () => {
    expect(headerText(box("id", { label: "Shown", stereotype: "s", sections: [["x"]] }))).toBe("Shown");
  });
});

describe("nodeSize", () => {
  it("gives fixed sizes to the markers", () => {
    expect(nodeSize({ id: "p", kind: "port", label: "very-long-name" })).toEqual({ w: 11, h: 11 });
    expect(nodeSize({ id: "s", kind: "start", label: "" })).toEqual({ w: 20, h: 20 });
    expect(nodeSize({ id: "e", kind: "end", label: "" })).toEqual({ w: 24, h: 24 });
    expect(nodeSize({ id: "b", kind: "bar", label: "" })).toEqual({ w: 120, h: 6 });
  });

  it("sizes an action from its widest line and its line count", () => {
    expect(nodeSize({ id: "a", kind: "action", label: "ab\\nabcd" })).toEqual({
      w: 4 * 8 + 2 * 10 + 8,
      h: 2 * 18 + 2 * 10 - 4,
    });
  });

  it("sizes a decision from its label, or as a bare diamond", () => {
    expect(nodeSize({ id: "d", kind: "decision", label: "" })).toEqual({ w: 24, h: 24 });
    expect(nodeSize({ id: "d", kind: "decision", label: "ok?" })).toEqual({ w: 3 * 8 + 20 + 28, h: 18 + 22 });
  });

  it("leaves room for a note's fold", () => {
    expect(nodeSize({ id: "n", kind: "note", label: "abc\nde" })).toEqual({ w: 3 * 8 + 20 + 9, h: 20 + 2 * 18 });
  });

  it("reserves the badge on a box and not on a container", () => {
    expect(nodeSize(box("x", { label: "Foo" }))).toEqual({ w: 3 * 8 + 20 + 20, h: 20 + 18 });
    expect(nodeSize(container("x", { label: "Foo" }))).toEqual({ w: 3 * 8 + 20, h: 20 + 18 });
  });

  it("adds a header line for a stereotype, which can set the width", () => {
    expect(nodeSize(box("x", { label: "F", stereotype: "function" }))).toEqual({
      w: 8 * 8 + 16 + 20,
      h: 20 + 2 * 18,
    });
  });

  it("counts every compartment's gap and lines, and its widest member", () => {
    expect(nodeSize(box("x", { label: "F", sections: [["+abc: int", "-b"], []] }))).toEqual({
      w: 9 * 8 + 12 + 20,
      h: 20 + 18 + 2 * 4 + 2 * 18,
    });
  });
});

describe("toElk", () => {
  const rootChildren = (ir: RenderIr) => toElk(ir).root.children ?? [];

  it("keeps one connected piece on the root's layered layout", () => {
    const { root, edgeHome } = toElk(doc([box("a"), box("b")], [edge("a", "b")]));
    expect(ids(root.children)).toEqual(["a", "b"]);
    expect(root.edges).toHaveLength(1);
    expect(root.edges![0]).toMatchObject({ id: "e0", sources: ["a"], targets: ["b"] });
    expect(edgeHome.get(0)).toBe("root");
    expect(root.layoutOptions!["elk.direction"]).toBe("DOWN");
    expect(root.children![0]).toMatchObject({ width: nodeSize(box("a")).w, height: nodeSize(box("a")).h });
  });

  it("reverses hierarchy relations so a base sits above its subtypes", () => {
    const { root } = toElk(
      doc(
        [box("sub"), box("base"), box("impl")],
        [edge("sub", "base", { kind: "inheritance" }), edge("impl", "base", { kind: "realization" })],
      ),
    );
    expect(root.edges![0]).toMatchObject({ sources: ["base"], targets: ["sub"] });
    expect(root.edges![1]).toMatchObject({ sources: ["base"], targets: ["impl"] });
  });

  it("gives a labelled relation a label box and an unlabelled one none", () => {
    const { root } = toElk(doc([box("a"), box("b")], [edge("a", "b", { label: "uses" }), edge("b", "a")]));
    expect(root.edges![0].labels).toEqual([labelBox("uses")]);
    expect(root.edges![1].labels).toBeUndefined();
  });

  it("makes a container a compound node with padding for its header", () => {
    const [c] = rootChildren(doc([container("c"), box("a", { parent: "c" })]));
    expect(c.id).toBe("c");
    expect(ids(c.children)).toEqual(["a"]);
    expect(c.layoutOptions!["elk.padding"]).toBe("[top=40,left=18,bottom=18,right=18]");
  });

  it("merges a reopened container into one compound node", () => {
    const children = rootChildren(doc([container("c"), box("a", { parent: "c" }), container("c")]));
    expect(ids(children)).toEqual(["c"]);
  });

  it("treats a parent that is no container, or itself, as the root", () => {
    const children = rootChildren(doc([box("host"), box("a", { parent: "host" }), container("self", { parent: "self" })]));
    expect(ids(children).sort()).toEqual([`root${PACK}`]);
    expect(ids(children[0].children).sort()).toEqual(["a", "host", "self"]);
  });

  it("drops relations whose ends name nothing", () => {
    const { root, edgeHome } = toElk(doc([box("a")], [edge("a", "ghost"), edge("ghost", "a")]));
    expect(root.edges).toEqual([]);
    expect(edgeHome.size).toBe(0);
  });

  it("leaves a relation between a node and its own container to the emitter", () => {
    const { root, edgeHome } = toElk(doc([container("c"), box("a", { parent: "c" })], [edge("a", "c"), edge("c", "a")]));
    expect(root.edges).toEqual([]);
    expect(edgeHome.size).toBe(0);
  });

  it("declares a relation at the lowest level holding both ends", () => {
    const { root, edgeHome } = toElk(
      doc(
        [container("c"), box("x", { parent: "c" }), box("y", { parent: "c" }), box("z")],
        [edge("x", "y"), edge("x", "z")],
      ),
    );
    expect(edgeHome.get(0)).toBe("c");
    expect(edgeHome.get(1)).toBe("root");
    expect(root.edges!.map((e) => e.id)).toEqual(["e1"]);
    const c = root.children!.find((n) => n.id === "c")!;
    expect(c.edges!.map((e) => e.id)).toEqual(["e0"]);
  });

  it("packs several components and loose boxes into invisible nodes", () => {
    const { root, edgeHome } = toElk(
      doc([box("a"), box("b"), box("c"), box("d"), box("loose")], [edge("a", "b"), edge("c", "d")]),
    );
    expect(ids(root.children)).toEqual([`root${PACK}`]);
    const pack = root.children![0];
    expect(pack.layoutOptions!["elk.algorithm"]).toBe("rectpacking");
    expect(ids(pack.children)).toEqual([`root${PACK}0`, `root${PACK}1`, "loose"]);
    expect(ids(pack.children![0].children)).toEqual(["a", "b"]);
    expect(ids(pack.children![1].children)).toEqual(["c", "d"]);
    expect(pack.children![1].edges!.map((e) => e.id)).toEqual(["e1"]);
    expect(edgeHome.get(0)).toBe(`root${PACK}0`);
    expect(edgeHome.get(1)).toBe(`root${PACK}1`);
    expect(root.edges).toEqual([]);
  });

  it("does not pack a single node", () => {
    expect(ids(rootChildren(doc([box("a")])))).toEqual(["a"]);
  });

  it("keeps a child with an edge reaching above its level out of the pack", () => {
    const { root } = toElk(
      doc(
        [container("c"), box("x", { parent: "c" }), box("y", { parent: "c" }), box("z", { parent: "c" }), box("out")],
        [edge("x", "out")],
      ),
    );
    const c = root.children!.find((n) => n.id === "c")!;
    expect(ids(c.children)).toEqual(["x", `c${PACK}`]);
    expect(ids(c.children![1].children)).toEqual(["y", "z"]);
  });

  it("turns a port into an ELK port on its owner, never a child", () => {
    const { root } = toElk(
      doc([box("b"), port("b.i", "b", { direction: "in" }), port("b.o", "b", { direction: "out" }), port("b.n", "b", { side: "north" })]),
    );
    expect(ids(root.children)).toEqual(["b"]);
    const host = root.children![0];
    expect((host.ports ?? []).map((p) => [p.id, p.layoutOptions!["elk.port.side"]])).toEqual([
      ["b.i", "WEST"],
      ["b.o", "EAST"],
      ["b.n", "NORTH"],
    ]);
    expect(host.layoutOptions!["elk.portConstraints"]).toBe("FIXED_SIDE");
  });

  it("lays a port's name inside a container and leaves a box's to the emitter", () => {
    const { root } = toElk(doc([box("b"), port("b.p", "b"), container("c"), port("c.pp", "c")], [edge("b.p", "c.pp")]));
    const host = (id: string) => root.children!.find((n) => n.id === id)!;
    expect((host("b").ports![0] as { labels?: unknown }).labels).toBeUndefined();
    expect(host("b").layoutOptions!["elk.portLabels.placement"]).toBeUndefined();
    expect((host("c").ports![0] as { labels?: unknown }).labels).toEqual([{ text: "pp", width: 12, height: 10 }]);
    expect(host("c").layoutOptions!["elk.portLabels.placement"]).toBe("INSIDE");
  });

  it("grows a block to hold its busiest side", () => {
    const nodes = [box("b"), ...["p1", "p2", "p3", "p4"].map((p) => port(`b.${p}`, "b", { direction: "in" }))];
    const [host] = toElk(doc(nodes)).root.children!;
    expect(host.height).toBe(4 * 11 + 3 * 18 + 2 * 18);
    const across = [box("t"), ...["p1", "p2", "p3", "p4", "p5", "p6"].map((p) => port(`t.${p}`, "t", { side: "north" }))];
    const [top] = toElk(doc(across)).root.children!;
    expect(top.width).toBe(6 * 11 + 5 * 18 + 2 * 18);
    expect(top.height).toBe(nodeSize(box("t")).h);
  });

  it("gives a ports-only container the minimum its names need", () => {
    const [c] = toElk(
      doc([container("c"), port("c.left", "c", { direction: "in" }), port("c.rightmost", "c", { direction: "out" })]),
    ).root.children!;
    const width = 4 * 6 + 9 * 6 + 4 * 18 + 2 * 11;
    expect(c.layoutOptions!["elk.nodeSize.minimum"]).toBe(`(${width},${c.height})`);
  });

  it("wires a port by its own id and files the edge under the owner's level", () => {
    const { root, edgeHome } = toElk(
      doc([box("a"), port("a.o", "a", { direction: "out" }), box("b"), port("b.i", "b", { direction: "in" })], [edge("a.o", "b.i")]),
    );
    expect(root.edges![0]).toMatchObject({ sources: ["a.o"], targets: ["b.i"] });
    expect(edgeHome.get(0)).toBe("root");
  });

  it("reports a port's wire into its owner in the owner's coordinates", () => {
    const { root, edgeHome } = toElk(
      doc([container("c"), port("c.i", "c", { direction: "in" }), box("a", { parent: "c" })], [edge("c.i", "a")]),
    );
    expect(root.edges!.map((e) => e.id)).toEqual(["e0"]);
    expect(edgeHome.get(0)).toBe("c");
  });

  it("drops a port with no owner, and any relation through it", () => {
    const { root, edgeHome } = toElk(doc([box("a"), { id: "p", kind: "port", label: "p" }], [edge("p", "a")]));
    expect(ids(root.children)).toEqual(["a"]);
    expect(root.children![0].ports).toBeUndefined();
    expect(edgeHome.size).toBe(0);
  });

  it("reads left to right when most ports sit on the west and east borders", () => {
    const wide = toElk(doc([box("a"), port("a.i", "a", { direction: "in" }), port("a.o", "a", { direction: "out" })]));
    expect(wide.root.layoutOptions!["elk.direction"]).toBe("RIGHT");
    expect(wide.root.layoutOptions!["elk.layered.wrapping.strategy"]).toBe("SINGLE_EDGE");
    const tall = toElk(doc([box("a"), port("a.n", "a", { side: "north" }), port("a.s", "a", { side: "south" })]));
    expect(tall.root.layoutOptions!["elk.direction"]).toBe("DOWN");
    expect(tall.root.layoutOptions!["elk.layered.wrapping.strategy"]).toBeUndefined();
  });

  it("tightens the layers of a flow diagram only", () => {
    const key = "elk.layered.spacing.nodeNodeBetweenLayers";
    expect(toElk(doc([box("a"), box("b")], [edge("a", "b", { kind: "flow" })])).root.layoutOptions![key]).toBe("36");
    expect(toElk(doc([box("a"), box("b")], [edge("a", "b")])).root.layoutOptions![key]).toBe("56");
  });
});

describe("absolutePositions", () => {
  it("offsets from the frame pad and accumulates through the nesting", () => {
    const out = absolutePositions({
      id: "root",
      children: [
        { id: "outer", x: 100, y: 200, width: 300, height: 400, children: [{ id: "inner", x: 1, y: 2, width: 3, height: 4 }] },
      ],
    });
    expect(out.get("outer")).toEqual({ x: 110, y: 210, w: 300, h: 400 });
    expect(out.get("inner")).toEqual({ x: 111, y: 212, w: 3, h: 4 });
    expect(out.has("root")).toBe(false);
  });

  it("rounds every field, without carrying the rounding down the tree", () => {
    const out = absolutePositions({
      id: "root",
      children: [
        { id: "a", x: 0.4, y: 0.4, width: 9.6, height: 9.4, children: [{ id: "b", x: 0.4, y: 0.4, width: 1, height: 1 }] },
      ],
    });
    expect(out.get("a")).toEqual({ x: 10, y: 10, w: 10, h: 9 });
    expect(out.get("b")).toEqual({ x: 11, y: 11, w: 1, h: 1 });
  });

  it("treats missing coordinates and sizes as zero", () => {
    expect(absolutePositions({ id: "root", children: [{ id: "a" }] }).get("a")).toEqual({ x: 10, y: 10, w: 0, h: 0 });
  });

  it("places ports relative to their owner and port names relative to the port", () => {
    const out = absolutePositions({
      id: "root",
      children: [
        {
          id: "a",
          x: 100,
          y: 100,
          width: 50,
          height: 50,
          ports: [
            { id: "a.p", x: 5, y: 6, width: 11, height: 11, labels: [{ x: 1, y: 2, width: 30, height: 10 }] } as never,
            { id: "a.q", x: 7, y: 8, width: 11, height: 11 },
          ],
        },
      ],
    });
    expect(out.get("a.p")).toEqual({ x: 115, y: 116, w: 11, h: 11 });
    expect(out.get(`a.p${LABEL_OF}`)).toEqual({ x: 116, y: 118, w: 30, h: 10 });
    expect(out.get("a.q")).toEqual({ x: 117, y: 118, w: 11, h: 11 });
    expect(out.has(`a.q${LABEL_OF}`)).toBe(false);
  });

  it("returns nothing for a childless root", () => {
    expect(absolutePositions({ id: "root" }).size).toBe(0);
  });
});

describe("layout", () => {
  it("places every node on integer coordinates, a base above its subtype", async () => {
    const { placed, routes } = await layout(
      doc([box("sub"), box("base")], [edge("sub", "base", { kind: "inheritance" })]),
    );
    const of = (id: string) => placed.find((p) => p.node.id === id)!;
    for (const p of placed) for (const v of [p.x, p.y, p.w, p.h]) expect(Number.isInteger(v)).toBe(true);
    expect(of("base").y + of("base").h).toBeLessThanOrEqual(of("sub").y);
    const { points } = routes.get(0)!;
    expect(points[0].y).toBe(of("sub").y);
    expect(points[points.length - 1].y).toBe(of("base").y + of("base").h);
  });

  it("keeps the declared direction for a relation that is no hierarchy", async () => {
    const { placed, routes } = await layout(doc([box("a"), box("b")], [edge("a", "b")]));
    const [a, b] = placed;
    expect(a.y + a.h).toBeLessThanOrEqual(b.y);
    const { points } = routes.get(0)!;
    expect(points[0].y).toBe(a.y + a.h);
    expect(points[points.length - 1].y).toBe(b.y);
  });

  it("lists children before containers, the deepest container first", async () => {
    const { placed } = await layout(
      doc([container("outer"), container("inner", { parent: "outer" }), box("leaf", { parent: "inner" })]),
    );
    expect(placed.map((p) => p.node.id)).toEqual(["leaf", "inner", "outer"]);
  });

  it("places a child inside its container, below the header", async () => {
    const { placed } = await layout(doc([container("c"), box("a", { parent: "c" })]));
    const [a, c] = placed;
    expect(a.x).toBeGreaterThanOrEqual(c.x + 18);
    expect(a.y).toBeGreaterThanOrEqual(c.y + 18 + 22);
    expect(a.x + a.w).toBeLessThanOrEqual(c.x + c.w);
    expect(a.y + a.h).toBeLessThanOrEqual(c.y + c.h);
  });

  it("places a reopened container once", async () => {
    const { placed } = await layout(doc([container("c"), box("a", { parent: "c" }), container("c")]));
    expect(placed.filter((p) => p.node.id === "c")).toHaveLength(1);
  });

  it("routes only what the router saw, under the edge's IR index", async () => {
    const { routes } = await layout(
      doc([box("a"), box("b"), container("c"), box("k", { parent: "c" })], [edge("a", "ghost"), edge("k", "c"), edge("a", "b")]),
    );
    expect([...routes.keys()]).toEqual([2]);
  });

  it("reports where the router put a relation's label", async () => {
    const { routes } = await layout(doc([box("a"), box("b")], [edge("a", "b", { label: "uses" })]));
    const { label } = routes.get(0)!;
    expect(label).toMatchObject({ w: labelBox("uses").width, h: labelBox("uses").height });
    expect(Number.isInteger(label!.x)).toBe(true);
    expect(Number.isInteger(label!.y)).toBe(true);
    expect(routes.get(0)!.points.length).toBeGreaterThanOrEqual(2);
  });

  it("shifts a packed component's route into absolute space", async () => {
    const { placed, routes } = await layout(
      doc([box("a"), box("b"), box("c"), box("d")], [edge("a", "b"), edge("c", "d")]),
    );
    for (const [i, [s, t]] of [["a", "b"], ["c", "d"]].entries()) {
      const from = placed.find((p) => p.node.id === s)!;
      const to = placed.find((p) => p.node.id === t)!;
      const { points } = routes.get(i)!;
      expect(points[0].y).toBe(from.y + from.h);
      expect(points[points.length - 1].y).toBe(to.y);
      expect(points[0].x).toBeGreaterThanOrEqual(from.x);
      expect(points[0].x).toBeLessThanOrEqual(from.x + from.w);
    }
  });

  it("gives a port a name box only when its name was laid out inside a container", async () => {
    const { placed } = await layout(
      doc([box("b"), port("b.p", "b"), container("c"), port("c.pp", "c"), box("k", { parent: "c" })], [edge("b.p", "c.pp")]),
    );
    expect(placed.find((p) => p.node.id === "b.p")!.label).toBeUndefined();
    expect(placed.find((p) => p.node.id === "c.pp")!.label).toMatchObject({ w: 12, h: 10 });
    expect(placed.find((p) => p.node.id === "b.p")).toMatchObject({ w: 11, h: 11 });
  });

  it("does not place a port with no owner", async () => {
    const { placed } = await layout(doc([box("a"), { id: "p", kind: "port", label: "p" }]));
    expect(placed.map((p) => p.node.id)).toEqual(["a"]);
  });
});

describe("layoutLanes", () => {
  const lane = (id: string) => container(id, { classifier: "swimlane" });
  const action = (id: string, parent?: string, label = "act"): IrNode => ({ id, kind: "action", label, parent });
  const flow = (from: string, to: string, label?: string): IrEdge => ({ from, to, kind: "flow", label });

  it("gives each lane a column and puts its nodes inside it", async () => {
    const { placed } = await layoutLanes(
      doc([lane("L1"), lane("L2"), action("a", "L1"), action("b", "L2")], [flow("a", "b")]),
    );
    const of = (id: string) => placed.find((p) => p.node.id === id)!;
    const w = nodeSize(action("a")).w;
    expect(of("L1")).toMatchObject({ x: 10, y: 10, w: 2 * 28 + w });
    expect(of("L2")).toMatchObject({ x: 10 + 2 * 28 + w, y: 10, w: 2 * 28 + w });
    expect(of("a").x).toBe(of("L1").x + 28);
    expect(of("b").x).toBe(of("L2").x + 28);
    expect(of("a").y).toBeGreaterThanOrEqual(10 + 28 + 10);
    expect(of("L1").y + of("L1").h).toBe(of("b").y + of("b").h + 10);
    expect(of("L2").h).toBe(of("L1").h);
  });

  it("lists leaves first, then partitions, then lanes", async () => {
    const { placed } = await layoutLanes(
      doc([lane("L"), container("part", { parent: "L" }), action("a", "part")]),
    );
    expect(placed.map((p) => p.node.id)).toEqual(["a", "part", "L"]);
  });

  it("draws a partition as the box around its descendants", async () => {
    const { placed } = await layoutLanes(doc([lane("L"), container("part", { parent: "L" }), action("a", "part")]));
    const [a, part] = placed;
    expect(part).toMatchObject({
      x: a.x - 18,
      y: a.y - 22 - 6,
      w: a.w + 2 * 18,
      h: a.h + 22 + 6 + 9,
    });
  });

  it("skips a partition with nothing in it", async () => {
    const { placed } = await layoutLanes(doc([lane("L"), container("part", { parent: "L" }), action("a", "L")]));
    expect(placed.map((p) => p.node.id)).toEqual(["a", "L"]);
  });

  it("files a node with no lane in the first lane", async () => {
    const { placed } = await layoutLanes(doc([lane("L1"), lane("L2"), action("a")]));
    const a = placed.find((p) => p.node.id === "a")!;
    expect(a.x).toBe(10 + 28);
  });

  it("runs a chain straight down its lane with a two-point route", async () => {
    const { placed, routes } = await layoutLanes(doc([lane("L"), action("a", "L"), action("b", "L")], [flow("a", "b")]));
    const [a, b] = placed;
    expect(a.x).toBe(b.x);
    const cx = Math.round(a.x + a.w / 2);
    expect(routes.get(0)!.points).toEqual([
      { x: cx, y: a.y + a.h },
      { x: cx, y: b.y },
    ]);
    expect(routes.get(0)!.label).toBeUndefined();
  });

  it("crosses lanes through the middle of the gap, label on the right going right", async () => {
    const { placed, routes } = await layoutLanes(
      doc([lane("L1"), lane("L2"), action("a", "L1"), action("b", "L2")], [flow("a", "b", "yes")]),
    );
    const a = placed.find((p) => p.node.id === "a")!;
    const b = placed.find((p) => p.node.id === "b")!;
    const sx = Math.round(a.x + a.w / 2);
    const tx = Math.round(b.x + b.w / 2);
    const y0 = a.y + a.h;
    const mid = Math.round((y0 + b.y) / 2);
    const route = routes.get(0)!;
    expect(route.points).toEqual([
      { x: sx, y: y0 },
      { x: sx, y: mid },
      { x: tx, y: mid },
      { x: tx, y: b.y },
    ]);
    expect(route.label).toEqual({ x: sx + 6, y: y0 + 13, w: 3 * 7, h: 14 });
  });

  it("puts the label on the left when the route goes left", async () => {
    const { placed, routes } = await layoutLanes(
      doc([lane("L1"), lane("L2"), action("a", "L2"), action("b", "L1")], [flow("a", "b", "no")]),
    );
    const a = placed.find((p) => p.node.id === "a")!;
    const sx = Math.round(a.x + a.w / 2);
    expect(routes.get(0)!.label).toMatchObject({ x: sx - 6 - 2 * 7, w: 2 * 7 });
  });

  it("sends back edges through staggered channels on the right", async () => {
    // Two 2-cycles: the router lays each out downwards, so exactly one edge of
    // each runs back up, whichever one it picks.
    const edges = [flow("a", "b", "again"), flow("b", "a", "again"), flow("c", "d", "again"), flow("d", "c", "again")];
    const { placed, routes } = await layoutLanes(
      doc([lane("L"), action("a", "L"), action("b", "L"), action("c", "L"), action("d", "L")], edges),
    );
    const of = (id: string) => placed.find((p) => p.node.id === id)!;
    const back = edges
      .map((e, index) => ({ index, s: of(e.from), t: of(e.to) }))
      .filter(({ s, t }) => t.y < s.y + s.h);
    expect(back).toHaveLength(2);
    back.forEach(({ index, s, t }, k) => {
      const channel = Math.max(s.x + s.w, t.x + t.w) + 18 + 10 * k;
      const sy = Math.round(s.y + s.h / 2);
      const ty = Math.round(t.y + t.h / 2);
      const route = routes.get(index)!;
      expect(route.points).toEqual([
        { x: s.x + s.w, y: sy },
        { x: channel, y: sy },
        { x: channel, y: ty },
        { x: t.x + t.w, y: ty },
      ]);
      expect(route.label).toEqual({ x: channel + 4, y: Math.round((sy + ty) / 2), w: 5 * 7, h: 14 });
    });
  });

  it("routes only flow relations between placed leaves", async () => {
    const { routes } = await layoutLanes(
      doc(
        [lane("L"), action("a", "L"), action("b", "L")],
        [edge("a", "b", { kind: "association" }), flow("a", "ghost"), flow("a", "b")],
      ),
    );
    expect([...routes.keys()]).toEqual([2]);
  });

  it("centres the narrower band of a lane under the widest", async () => {
    const { placed } = await layoutLanes(
      doc([lane("L"), action("wide", "L", "a much wider action label"), action("thin", "L", "x")], [flow("wide", "thin")]),
    );
    const wide = placed.find((p) => p.node.id === "wide")!;
    const thin = placed.find((p) => p.node.id === "thin")!;
    expect(Math.abs(wide.x + wide.w / 2 - (thin.x + thin.w / 2))).toBeLessThanOrEqual(1);
    expect(thin.x).toBeGreaterThan(wide.x);
  });
});

describe("arrowScale", () => {
  it("defaults to the natural size", () => {
    expect(arrowScale(undefined)).toBe(1);
    expect(arrowScale({})).toBe(1);
    expect(arrowScale({ "--pr-stroke": "2" })).toBe(1);
  });

  it("reads the token", () => {
    expect(arrowScale({ "--pr-arrow-size": "0.7" })).toBe(0.7);
    expect(arrowScale({ "--pr-arrow-size": "4" })).toBe(4);
  });

  it("caps it at four", () => {
    expect(arrowScale({ "--pr-arrow-size": "10" })).toBe(4);
  });

  it.each(["0", "-1", "big", "Infinity", ""])("falls back to natural for %j", (raw) => {
    expect(arrowScale({ "--pr-arrow-size": raw })).toBe(1);
  });
});

describe("markers", () => {
  it("declares every marker under the diagram's prefix", () => {
    const ids = [...markers("px-").matchAll(/<marker id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(["px-tri", "px-diamond-filled", "px-diamond", "px-arrow", "px-tri-solid"]);
  });

  it("keeps the natural size by default", () => {
    expect(markers("p")).toContain('id="ptri" viewBox="0 0 14 12" refX="13" refY="6" markerWidth="14" markerHeight="12"');
  });

  it("scales sizes, rounded to two decimals, and never the viewBox", () => {
    const half = markers("p", 0.5);
    expect(half).toContain('viewBox="0 0 14 12" refX="13" refY="6" markerWidth="7" markerHeight="6"');
    expect(markers("p", 0.33)).toContain('markerWidth="4.62" markerHeight="3.96"');
  });
});

describe("anchor", () => {
  const p = at(box("p"), 100, 100, 40, 20);

  it("takes the top centre when the other sits above", () => {
    expect(anchor(p, at(box("o"), 500, 0, 10, 100))).toEqual({ x: 120, y: 100 });
  });

  it("takes the bottom centre when the other sits below", () => {
    expect(anchor(p, at(box("o"), 0, 120, 10, 10))).toEqual({ x: 120, y: 120 });
  });

  it("takes a side's middle when they overlap vertically", () => {
    expect(anchor(p, at(box("o"), 300, 105, 10, 10))).toEqual({ x: 140, y: 110 });
    expect(anchor(p, at(box("o"), 0, 105, 10, 10))).toEqual({ x: 100, y: 110 });
  });

  it("counts an other starting on the centre line as being to the right", () => {
    expect(anchor(p, at(box("o"), 120, 105, 10, 10))).toEqual({ x: 140, y: 110 });
  });
});

describe("classifierOf", () => {
  it("prefers the declared classifier", () => {
    expect(classifierOf(box("x", { classifier: "enum", stereotype: "function" }))).toBe("enum");
  });

  it("reads the function stereotype as a classifier, and only that one", () => {
    expect(classifierOf(box("x", { stereotype: "function" }))).toBe("function");
    expect(classifierOf(box("x", { stereotype: "service" }))).toBeUndefined();
    expect(classifierOf(box("x"))).toBeUndefined();
  });
});

describe("sideOf", () => {
  it("returns the declared side whatever the direction", () => {
    expect(sideOf(port("p", "b", { side: "north", direction: "out" }))).toBe("north");
    expect(sideOf(port("p", "b", { side: "west", direction: "out" }))).toBe("west");
  });

  it("derives it from the direction otherwise, west by default", () => {
    expect(sideOf(port("p", "b", { direction: "out" }))).toBe("east");
    expect(sideOf(port("p", "b", { direction: "in" }))).toBe("west");
    expect(sideOf(port("p", "b"))).toBe("west");
  });
});

describe("emitNode", () => {
  const out = (node: IrNode, x = 100, y = 200, w = 80, h = 40, label?: { x: number; y: number; w: number; h: number }) =>
    emitNode(at(node, x, y, w, h, label), "px-");

  it("carries the prefixed id, the logical id and the classes", () => {
    const svg = out(box("a<b", { classifier: "enum", stereotype: "my stereo!", abstract: true }));
    expect(svg).toContain('<g id="px-a&lt;b" data-id="a&lt;b"');
    expect(svg).toContain('class="pr-box pr-classifier-enum pr-stereotype-my-stereo- pr-abstract"');
    expect(svg.endsWith("</g>")).toBe(true);
  });

  it("wraps in a link, with tooltip and references, when it carries them", () => {
    const svg = out(box("a", { href: "x.html", title: "tip", refs: { req: ["R1", "R2"] } }));
    expect(svg.startsWith('<a href="x.html" class="pr-link">')).toBe(true);
    expect(svg).toContain("<title>tip</title>");
    expect(svg).toContain('data-ref-req="R1 R2"');
  });

  it("emits no anchor or title when there is none", () => {
    const svg = out(box("a"));
    expect(svg).not.toContain("<a ");
    expect(svg).not.toContain("<title>");
  });

  it("draws a west port's name to the left, end-anchored, above the square", () => {
    const svg = out(port("b.in", "b", { direction: "in" }), 100, 200, 11, 11);
    expect(svg).toContain('class="pr-port"');
    expect(svg).toContain('<rect x="100" y="200" width="11" height="11"/>');
    expect(svg).toContain('<text class="pr-port-label" x="98" y="197" text-anchor="end">in</text>');
  });

  it("draws an east port's name to the right and marks it as output", () => {
    const svg = out(port("b.out", "b", { direction: "out" }), 100, 200, 11, 11);
    expect(svg).toContain('class="pr-port pr-port-out"');
    expect(svg).toContain('<text class="pr-port-label" x="113" y="197">out</text>');
  });

  it("draws a port's name in the room the layout reserved for it", () => {
    const room = { x: 50, y: 60, w: 30, h: 10 };
    expect(out(port("c.i", "c", { direction: "in" }), 100, 200, 11, 11, room)).toContain(
      '<text class="pr-port-label" x="50" y="69">i</text>',
    );
    expect(out(port("c.o", "c", { direction: "out" }), 100, 200, 11, 11, room)).toContain(
      '<text class="pr-port-label" x="80" y="69" text-anchor="end">o</text>',
    );
  });

  it("draws a swimlane with a separator and a centred header", () => {
    const svg = out(container("L", { classifier: "swimlane" }));
    expect(svg).toContain('<rect x="100" y="200" width="80" height="40"/>');
    expect(svg).toContain('<line class="pr-sep" x1="100" y1="228" x2="180" y2="228"/>');
    expect(svg).toContain('<text class="pr-header" x="140" y="218" text-anchor="middle">L</text>');
  });

  it("draws a plain container as a rounded frame with its header in the corner", () => {
    const svg = out(container("ns"));
    expect(svg).toContain('<rect x="100" y="200" width="80" height="40" rx="6"/>');
    expect(svg).toContain('<text class="pr-header" x="110" y="215">ns</text>');
    expect(svg).not.toContain("pr-sep");
  });

  it("draws an action's lines centred, one row each", () => {
    const svg = out({ id: "a", kind: "action", label: "one\\ntwo" });
    expect(svg).toContain('rx="10"');
    expect(svg).toContain('<text x="140" y="218">one</text>');
    expect(svg).toContain('<text x="140" y="236">two</text>');
  });

  it("draws a decision as a diamond, with text only when labelled", () => {
    const labelled = out({ id: "d", kind: "decision", label: "ok?" });
    expect(labelled).toContain('<path d="M140,200 L180,220 L140,240 L100,220 Z"/>');
    expect(labelled).toContain('<text x="140" y="224">ok?</text>');
    expect(out({ id: "d", kind: "decision", label: "" })).not.toContain("<text");
  });

  it("draws a start as a filled circle", () => {
    expect(out({ id: "s", kind: "start", label: "" }, 0, 0, 20, 20)).toContain('<circle cx="10" cy="10" r="9"/>');
  });

  it("draws a stop as ring and core, and an `end` classifier as ring and cross", () => {
    const stop = out({ id: "e", kind: "end", label: "" }, 0, 0, 24, 24);
    expect(stop).toContain('<circle class="pr-ring" cx="12" cy="12" r="11"/>');
    expect(stop).toContain('<circle class="pr-core" cx="12" cy="12" r="7"/>');
    expect(stop).not.toContain("pr-cross");
    const crossed = out({ id: "e", kind: "end", label: "", classifier: "end" }, 0, 0, 24, 24);
    expect(crossed).toContain('class="pr-cross"');
    expect(crossed).not.toContain("pr-core");
  });

  it("draws a bar as a slightly rounded rectangle", () => {
    expect(out({ id: "b", kind: "bar", label: "" }, 1, 2, 120, 6)).toContain('<rect x="1" y="2" width="120" height="6" rx="2"/>');
  });

  it("draws a note with its fold and its lines", () => {
    const svg = out({ id: "n", kind: "note", label: "a<b\nc" });
    expect(svg).toContain('<path d="M100,200 H171 L180,209 V240 H100 Z"/>');
    expect(svg).toContain('<path d="M171,200 V209 H180"/>');
    expect(svg).toContain('<text x="110" y="222">a&lt;b</text>');
    expect(svg).toContain('<text x="110" y="240">c</text>');
  });

  it.each([
    [{}, "C"],
    [{ classifier: "interface" }, "I"],
    [{ classifier: "function" }, "f"],
    [{ stereotype: "function" }, "f"],
    [{ classifier: "widget" }, "W"],
    [{ abstract: true }, "A"],
    [{ abstract: true, classifier: "enum" }, "E"],
  ] as [Partial<IrNode>, string][])("badges a box with %j as %s", (extra, letter) => {
    expect(out(box("a", extra))).toContain(`text-anchor="middle">${letter}</text>`);
  });

  it("writes the stereotype above the header and pushes the header down a row", () => {
    const svg = out(box("a", { stereotype: "s" }));
    expect(svg).toContain('<text class="pr-stereo" x="110" y="220">«s»</text>');
    expect(svg).toContain('<text class="pr-header" x="130" y="240">a</text>');
    expect(out(box("a"))).toContain('<text class="pr-header" x="130" y="222">a</text>');
  });

  it("makes the header band the full height without compartments", () => {
    expect(out(box("a"))).toContain("V240 H100");
  });

  it("draws compartments: a separator each, and a dot for a member's visibility", () => {
    const svg = out(box("a", { sections: [["+f: int", "plain"], ["-g()"]] }));
    expect(svg.match(/class="pr-sep"/g)).toHaveLength(2);
    expect(svg).toContain('class="pr-vis pr-vis-public"');
    expect(svg).toContain('class="pr-vis pr-vis-private"');
    expect(svg.match(/class="pr-vis /g)).toHaveLength(2);
    // a member with visibility is indented past its dot, one without is not
    expect(svg).toMatch(/<text x="122" y="\d+"><tspan class="pr-name">f<\/tspan>/);
    expect(svg).toMatch(/<text x="110" y="\d+"><tspan class="pr-name">plain<\/tspan>/);
  });
});

describe("emitEdge", () => {
  const a = at(box("a"), 0, 0, 100, 50);
  const b = at(box("b"), 0, 200, 100, 50);
  const byId = new Map([
    ["a", a],
    ["b", b],
  ]);

  it("draws nothing when an end was not placed", () => {
    expect(emitEdge(edge("a", "ghost"), byId, "p-")).toEqual({ path: "", label: "" });
    expect(emitEdge(edge("ghost", "b"), byId, "p-")).toEqual({ path: "", label: "" });
  });

  it("falls back to a straight anchored line without a route", () => {
    const { path, label } = emitEdge(edge("a", "b"), byId, "p-");
    expect(path).toContain('<path class="pr-edge-hit" d="M50,50 L50,200"/>');
    expect(path).toContain('<path class="pr-edge pr-edge-association" d="M50,50 L50,200" marker-end="url(#p-arrow)"/>');
    expect(label).toBe("");
  });

  it("falls back as well when the route has fewer than two points", () => {
    const { path } = emitEdge(edge("a", "b"), byId, "p-", { points: [{ x: 1, y: 1 }] });
    expect(path).toContain('d="M50,50 L50,200"');
  });

  it("follows the route it was given", () => {
    const route = { points: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }] };
    expect(emitEdge(edge("a", "b"), byId, "p-", route).path).toContain('d="M1,2 L3,4 L5,6"');
  });

  it.each([
    ["composition", "diamond-filled"],
    ["aggregation", "diamond"],
  ] as const)("draws a %s from the part to the whole", (kind, marker) => {
    const route = { points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] };
    const { path } = emitEdge(edge("a", "b", { kind }), byId, "p-", route);
    expect(path).toContain('d="M3,4 L1,2"');
    expect(path).toContain(`marker-end="url(#p-${marker})"`);
    expect(route.points[0]).toEqual({ x: 1, y: 2 });
  });

  it.each([
    ["inheritance", "tri"],
    ["realization", "tri"],
    ["dependency", "arrow"],
    ["flow", "tri-solid"],
  ] as const)("marks a %s with %s", (kind, marker) => {
    expect(emitEdge(edge("a", "b", { kind }), byId, "p-").path).toContain(`marker-end="url(#p-${marker})"`);
  });

  it("gives an attachment no marker", () => {
    expect(emitEdge(edge("a", "b", { kind: "attachment" }), byId, "p-").path).not.toContain("marker-end");
  });

  it("carries identity, references and tooltip on the group, the link around it", () => {
    const { path } = emitEdge(
      edge("a", "b", { title: "why", refs: { req: "R1" }, href: "x.html" }),
      byId,
      "p-",
    );
    expect(path.startsWith('<a href="x.html" class="pr-link"><g class="pr-edge-group" data-from="a" data-to="b" data-ref-req="R1"><title>why</title>')).toBe(true);
  });

  it("writes a label where the router put it", () => {
    const route = { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], label: { x: 77, y: 88, w: 10, h: 10 } };
    expect(emitEdge(edge("a", "b", { label: "a<b" }), byId, "p-", route).label).toBe(
      '<text class="pr-edge-label" x="77" y="88">a&lt;b</text>',
    );
  });

  it("writes an unplaced label beside the middle of the longest segment", () => {
    const route = { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 100 }, { x: 20, y: 100 }] };
    expect(emitEdge(edge("a", "b", { label: "t" }), byId, "p-", route).label).toBe(
      '<text class="pr-edge-label" x="16" y="46">t</text>',
    );
  });

  it("writes a multi-line label as one tspan per line, each a row apart", () => {
    const route = { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], label: { x: 7, y: 8, w: 1, h: 1 } };
    expect(emitEdge(edge("a", "b", { label: "one\ntwo" }), byId, "p-", route).label).toBe(
      '<text class="pr-edge-label" x="7" y="8"><tspan x="7" dy="0">one</tspan><tspan x="7" dy="14">two</tspan></text>',
    );
  });
});

describe("danglingNotice", () => {
  const placed = [at(box("a")), at(box("b"))];

  it("stays quiet when every end was placed", () => {
    expect(danglingNotice(doc([], [edge("a", "b")]), placed)).toBeUndefined();
  });

  it("uses the singular for one relation and one name", () => {
    expect(danglingNotice(doc([], [edge("a", "x")]), placed)).toBe(
      "1 relation not drawn: x is not declared in this diagram.",
    );
  });

  it("counts relations, not names, and names each missing end once", () => {
    expect(danglingNotice(doc([], [edge("a", "x"), edge("x", "y")]), placed)).toBe(
      "2 relations not drawn: x, y are not declared in this diagram.",
    );
  });

  it("names four and counts the rest", () => {
    const edges = ["p", "q", "r", "s", "t", "u"].map((n) => edge("a", n));
    expect(danglingNotice(doc([], edges), placed)).toBe(
      "6 relations not drawn: p, q, r, s and 2 more are not declared in this diagram.",
    );
  });
});

describe("unportedNotice", () => {
  const ctl = box("sys.Ctl");
  const ports = [port("sys.Ctl.i", "sys.Ctl", { direction: "in" }), port("sys.Ctl.o", "sys.Ctl", { direction: "out" })];
  const other = box("Other");
  const placed = [at(ctl), at(other), ...ports.map((p) => at(p))];

  it("stays quiet when relations go through ports or the block has none", () => {
    const ir = doc([ctl, other, ...ports], [edge("Other", "sys.Ctl.i"), edge("sys.Ctl.o", "Other")]);
    expect(unportedNotice(ir, placed)).toBeUndefined();
    expect(unportedNotice(doc([box("a"), box("b")], [edge("a", "b")]), [at(box("a")), at(box("b"))])).toBeUndefined();
  });

  it("names the block by its last segment and the ports on the incoming side", () => {
    const ir = doc([ctl, other, ...ports], [edge("Other", "sys.Ctl")]);
    const text = unportedNotice(ir, placed)!;
    expect(text.startsWith("1 relation ")).toBe(true);
    expect(text.endsWith("instead of one of its ports: Ctl (i). Name the port, as in Block::port.")).toBe(true);
  });

  it("names the outgoing ports for a relation leaving the block", () => {
    const ir = doc([ctl, other, ...ports], [edge("sys.Ctl", "Other")]);
    expect(unportedNotice(ir, placed)).toContain(": Ctl (o).");
  });

  it("merges both sides of a block without repeating a port", () => {
    const ir = doc([ctl, other, ...ports], [edge("Other", "sys.Ctl"), edge("sys.Ctl", "Other"), edge("Other", "sys.Ctl")]);
    const text = unportedNotice(ir, placed)!;
    expect(text.startsWith("3 relations reach")).toBe(true);
    expect(text).toContain(": Ctl (i, o).");
  });

  it("counts a relation between two blocks once and names both", () => {
    const b1 = box("b1");
    const b2 = box("b2");
    const ps = [port("b1.o", "b1", { direction: "out" }), port("b2.i", "b2", { direction: "in" })];
    const text = unportedNotice(doc([b1, b2, ...ps], [edge("b1", "b2")]), [at(b1), at(b2)])!;
    expect(text.startsWith("1 relation ")).toBe(true);
    expect(text).toContain("b2 (i); b1 (o)");
  });

  it("does not complain about a side the block offers no port on", () => {
    const b = box("b");
    const ir = doc([b, other, port("b.o", "b", { direction: "out" })], [edge("Other", "b")]);
    expect(unportedNotice(ir, [at(b), at(other)])).toBeUndefined();
  });

  it("ignores a block that was not drawn", () => {
    const ir = doc([ctl, other, ...ports], [edge("Other", "sys.Ctl")]);
    expect(unportedNotice(ir, [at(other)])).toBeUndefined();
  });

  it("names four blocks and counts the rest", () => {
    const names = ["a", "b", "c", "d", "e", "f"];
    const nodes = names.flatMap((n) => [box(n), port(`${n}.i`, n, { direction: "in" })]);
    const ir = doc([other, ...nodes], names.map((n) => edge("Other", n)));
    const text = unportedNotice(ir, [at(other), ...names.map((n) => at(box(n)))])!;
    expect(text).toContain("a (i); b (i); c (i); d (i) and 2 more.");
  });
});

describe("emit", () => {
  const viewBox = (svg: string) => /viewBox="([^"]+)"/.exec(svg)![1].split(" ").map(Number);

  it("frames the content's bounding box plus the pad", () => {
    const svg = emit(doc([box("a")]), [at(box("a"), 10, 10, 100, 50)], new Map());
    expect(viewBox(svg)).toEqual([0, 0, 120, 70]);
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("stretches the frame over routes and their labels", () => {
    const route = { points: [{ x: 500, y: 20 }, { x: 500, y: 40 }] };
    expect(viewBox(emit(doc([box("a")]), [at(box("a"), 10, 10, 100, 50)], new Map([[0, route]])))).toEqual([0, 0, 510, 70]);
    const labelled = {
      points: [{ x: 20, y: 20 }, { x: 40, y: 20 }],
      label: { x: 200, y: 300, w: 50, h: 14 },
    };
    expect(viewBox(emit(doc([box("a")]), [at(box("a"), 10, 10, 100, 50)], new Map([[0, labelled]])))).toEqual([0, 0, 260, 310]);
  });

  it("leaves room for a port's outside name, not for one laid out inside", () => {
    const west = port("b.name", "b", { direction: "in" });
    const outside = emit(doc([west]), [at(west, 100, 100, 11, 11)], new Map());
    expect(viewBox(outside)[0]).toBe(100 - (4 * 6 + 4) - 10);
    expect(viewBox(outside)[1]).toBe(100 - 14 - 10);
    const east = port("b.name", "b", { direction: "out" });
    const right = emit(doc([east]), [at(east, 100, 100, 11, 11)], new Map());
    const [minX, , width] = viewBox(right);
    expect(minX + width).toBe(100 + 11 + 28 + 10);
    const inside = emit(doc([west]), [at(west, 100, 100, 11, 11, { x: 100, y: 100, w: 1, h: 1 })], new Map());
    expect(viewBox(inside)[0]).toBe(90);
  });

  it("says so when there is nothing to draw", () => {
    const svg = emit(doc([]), [], new Map());
    expect(svg).toContain(">Nothing to draw.</text>");
    expect(viewBox(svg)).toEqual([-10, -10, 16 * 8 + 20 + 20, 18 + 20 - 4 + 20]);
  });

  it("shows the producer's notice alone when nothing was drawn, even with dangling edges", () => {
    const svg = emit(doc([], [edge("a", "b")], { notice: "not drawn: gantt" }), [], new Map());
    expect(svg).toContain(">not drawn: gantt</text>");
    expect(svg).not.toContain("Nothing to draw.");
    expect(svg).not.toContain("not declared");
  });

  it("stacks the producer's, the dangling and the port notice below the content", () => {
    const b = box("b");
    const ps = port("b.i", "b", { direction: "in" });
    const a = box("a");
    const ir = doc([a, b, ps], [edge("a", "b"), edge("a", "ghost")], { notice: "heads up" });
    const svg = emit(ir, [at(a, 10, 10, 50, 50), at(b, 10, 100, 50, 50)], new Map());
    const texts = [...svg.matchAll(/<g class="pr-notice"><rect x="10" y="170"[^]*?<\/g>/g)];
    expect(texts).toHaveLength(1);
    const lines = [...texts[0][0].matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    expect(lines[0]).toBe("heads up");
    expect(lines[1]).toContain("1 relation not drawn: ghost is not declared");
    expect(lines[2]).toContain("instead of one of its ports: b (i)");
  });

  it("paints containers outer-first, then edges, leaves and edge labels", () => {
    const outer = container("outer");
    const inner = container("inner", { parent: "outer" });
    const a = box("a");
    const b = box("b");
    const ir = doc([outer, inner, a, b], [edge("a", "b", { label: "the-label" })]);
    const svg = emit(ir, [at(a, 0, 0), at(b, 0, 200), at(inner), at(outer)], new Map());
    const order = ['data-id="outer"', 'data-id="inner"', 'class="pr-edge-group"', 'data-id="a"', 'data-id="b"', ">the-label<"].map((s) =>
      svg.indexOf(s),
    );
    expect(order.every((v) => v >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
  });

  it("uses each edge's own route by its index", () => {
    const a = box("a");
    const b = box("b");
    const route = { points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] };
    const svg = emit(doc([a, b], [edge("a", "b", { label: "skip" }), edge("b", "a")]), [at(a), at(b, 0, 200)], new Map([[1, route]]));
    expect(svg).toContain('d="M1,2 L3,4"');
    expect(svg.match(/d="M1,2 L3,4"/g)).toHaveLength(2);
  });

  it("prefixes ids from the title, so two diagrams do not collide", () => {
    const a = box("a");
    const one = emit(doc([a], [], { title: "one" }), [at(a)], new Map());
    const two = emit(doc([a], [], { title: "two" }), [at(a)], new Map());
    const prefix = (s: string) => /<g id="([^"]*)a" data-id="a"/.exec(s)![1];
    expect(prefix(one)).not.toBe(prefix(two));
    expect(one).toContain(`<marker id="${prefix(one)}tri"`);
  });

  it("escapes the title and leaves it out when absent", () => {
    expect(emit(doc([], [], { title: "a<b" }), [], new Map())).toContain("<title>a&lt;b</title>");
    expect(emit(doc([]), [], new Map())).not.toContain("<title>");
  });

  it("bakes the tokens in, the arrow size into the markers", () => {
    const a = box("a");
    const svg = emit(doc([a]), [at(a)], new Map(), { "--pr-stroke": "#123", "--pr-arrow-size": "0.5" });
    expect(svg).toContain("--pr-stroke: #123;");
    expect(svg).toContain('refX="13" refY="6" markerWidth="7" markerHeight="6"');
  });
});

describe("renderSvg", () => {
  const rectOf = (svg: string, id: string) => {
    const m = new RegExp(`data-id="${id}"[^>]*>(?:<title>[^<]*</title>)?<rect x="(-?[\\d.]+)" y="(-?[\\d.]+)"`).exec(svg)!;
    return { x: Number(m[1]), y: Number(m[2]) };
  };

  it("rejects an invalid document rather than drawing it", async () => {
    await expect(renderSvg({ ir: 2, nodes: [], edges: [] })).rejects.toBeInstanceOf(IrValidationError);
    await expect(renderSvg({ nodes: [] })).rejects.toBeInstanceOf(IrValidationError);
  });

  it("draws the same bytes for the same document", async () => {
    const ir = doc([box("a"), box("b"), box("c")], [edge("a", "b", { label: "x" }), edge("c", "b", { kind: "inheritance" })]);
    expect(await renderSvg(ir)).toBe(await renderSvg(structuredClone(ir)));
  });

  it("draws an empty document as a notice", async () => {
    expect(await renderSvg(doc([]))).toContain("Nothing to draw.");
  });

  it("bundles parallel relations before drawing", async () => {
    const svg = await renderSvg(doc([box("a"), box("b")], [edge("a", "b", { label: "one" }), edge("a", "b", { label: "two" })]));
    expect(svg.match(/class="pr-edge-group"/g)).toHaveLength(1);
    expect(svg).toContain(">one</tspan>");
    expect(svg).toContain(">two</tspan>");
  });

  it("switches to the time-axis layout on a lifeline, ignoring positions", async () => {
    const ir = doc(
      [
        { id: "a", kind: "lifeline", label: "A" },
        { id: "b", kind: "lifeline", label: "B" },
      ],
      [{ from: "a", to: "b", kind: "message", order: 1, label: "hi" }],
    );
    const svg = await renderSvg(ir);
    expect(svg).toContain('class="pr-lifeline');
    expect(await renderSvg(ir, { positions: { a: { dx: 100, dy: 100 } } })).toBe(svg);
  });

  it("switches to lane columns on a swimlane", async () => {
    const svg = await renderSvg(
      doc(
        [
          container("L", { classifier: "swimlane" }),
          { id: "a", kind: "action", label: "a", parent: "L" },
          { id: "b", kind: "action", label: "b", parent: "L" },
        ],
        [{ from: "a", to: "b", kind: "flow" }],
      ),
    );
    expect(svg).toContain('class="pr-container pr-classifier-swimlane"');
    expect(svg).toContain('class="pr-edge pr-edge-flow"');
    expect(svg).toContain('class="pr-sep"');
  });

  it("moves a dragged node and its edges fall back to anchored lines", async () => {
    const ir = doc([box("a"), box("b")], [edge("a", "b")]);
    const base = await renderSvg(ir);
    const moved = await renderSvg(ir, { positions: { b: { dx: 300, dy: 40 } } });
    const before = rectOf(base, "b");
    const after = rectOf(moved, "b");
    expect(after).toEqual({ x: before.x + 300, y: before.y + 40 });
    expect(rectOf(moved, "a")).toEqual(rectOf(base, "a"));
    const d = /class="pr-edge pr-edge-association" d="([^"]+)"/.exec(moved)![1];
    expect(d.split(" ")).toHaveLength(2);
  });

  it("grows a container around a dragged child", async () => {
    const ir = doc([container("c"), box("a", { parent: "c" })]);
    const moved = await renderSvg(ir, { positions: { a: { dx: 500, dy: 0 } } });
    const a = rectOf(moved, "a");
    const c = /data-id="c"[^>]*><rect x="(-?\d+)" y="-?\d+" width="(\d+)"/.exec(moved)!;
    const width = Number(/data-id="a"[^>]*><rect x="-?\d+" y="-?\d+" width="(\d+)"/.exec(moved)![1]);
    expect(Number(c[1]) + Number(c[2])).toBe(a.x + width + 18);
  });

  it("treats empty positions as no drag at all", async () => {
    const ir = doc([box("a"), box("b")], [edge("a", "b")]);
    expect(await renderSvg(ir, { positions: {} })).toBe(await renderSvg(ir));
  });

  it("applies the tokens it was given", async () => {
    const svg = await renderSvg(doc([box("a")]), { tokens: { "--pr-edge-width": "3" } });
    expect(svg).toContain("--pr-edge-width: 3;");
  });
});
