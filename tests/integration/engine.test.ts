import { describe, expect, it } from "vitest";

import { renderSvg } from "../../src/render/engine.js";

const IR = {
  ir: 1 as const,
  title: "demo",
  nodes: [
    { id: "ns", kind: "container" as const, label: "core", classifier: "namespace" },
    {
      id: "ns.Base",
      kind: "box" as const,
      label: "Base",
      classifier: "class",
      abstract: true,
      sections: [["+ id : str"], ["+ load() : None"]],
      parent: "ns",
    },
    { id: "ns.Impl", kind: "box" as const, label: "Impl", classifier: "class", parent: "ns" },
    { id: "note-1", kind: "note" as const, label: "remember" },
  ],
  edges: [
    { from: "ns.Impl", to: "ns.Base", kind: "inheritance" as const },
    { from: "note-1", to: "ns.Impl", kind: "attachment" as const },
  ],
};

describe("engine", () => {
  it("is byte-deterministic", async () => {
    expect(await renderSvg(IR)).toBe(await renderSvg(IR));
  });

  it("emits stable ids, theming classes and typed markers", async () => {
    const svg = await renderSvg(IR);
    expect(svg).toContain('id="ns.Base"');
    expect(svg).toContain("pr-classifier-class");
    expect(svg).toContain("pr-abstract");
    expect(svg).toMatch(/marker-end="url\(#pr[0-9a-z]+-tri\)"/);
    expect(svg).toContain('data-id="ns.Base"');
    expect(svg).toContain("pr-edge-attachment");
    expect(svg).toContain("var(--pr-stroke");
    expect(svg).toContain("<title>demo</title>");
  });

  it("layers inheritance targets above sources", async () => {
    const svg = await renderSvg(IR);
    const y = (id: string) => {
      const match = svg.match(new RegExp(`id="${id}"[^>]*>\\s*<rect [^>]*y="(\\d+)"`));
      return Number(match?.[1]);
    };
    expect(y("ns.Base")).toBeLessThan(y("ns.Impl"));
  });

  it("escapes markup in labels", async () => {
    const svg = await renderSvg({
      ir: 1,
      nodes: [{ id: "a", kind: "box", label: "<X&Y>" }],
      edges: [],
    });
    expect(svg).toContain("&lt;X&amp;Y&gt;");
  });
});

describe("engine", () => {
  it("draws a producer's notice under the content and alone for an empty document", async () => {
    const plain = await renderSvg(IR);
    const noted = await renderSvg({ ...IR, notice: "Activity diagram: not drawn.\nRender it with plantuml.jar." });
    expect(noted).toContain('class="pr-notice"');
    expect(noted).toContain("Render it with plantuml.jar.");
    const height = (svg: string) => Number(/height="(\d+)"/.exec(svg)![1]);
    expect(height(noted)).toBeGreaterThan(height(plain));

    const empty = await renderSvg({ ir: 1, nodes: [], edges: [] });
    expect(empty).toContain("Nothing to draw.");
    expect(Number(/width="(\d+)"/.exec(empty)![1])).toBeGreaterThan(30);
  });

  it("draws the notice in the sequence layout too", async () => {
    const svg = await renderSvg({
      ir: 1,
      nodes: [{ id: "A", kind: "lifeline", label: "A" }, { id: "B", kind: "lifeline", label: "B" }],
      edges: [{ from: "A", to: "B", kind: "message", label: "go", order: 0 }],
      notice: "Something to say.",
    });
    expect(svg).toContain('class="pr-notice"');
    expect(svg).toContain("Something to say.");
  });
});

describe("relations that cannot be drawn", () => {
  const withEdges = (edges: { from: string; to: string }[]) => ({
    ir: 1 as const,
    nodes: [
      { id: "A", kind: "box" as const, label: "A", classifier: "class" },
      { id: "B", kind: "box" as const, label: "B", classifier: "class" },
    ],
    edges: edges.map((e) => ({ ...e, kind: "association" as const })),
  });

  it("names the endpoints that nothing declares", async () => {
    const svg = await renderSvg(withEdges([{ from: "A", to: "Bee" }]));
    expect(svg).toContain('<g class="pr-notice">');
    expect(svg).toContain("1 relation not drawn: Bee is not declared in this diagram.");
  });

  it("counts the relations and lists the names once each", async () => {
    const svg = await renderSvg(
      withEdges([
        { from: "A", to: "Bee" },
        { from: "Bee", to: "B" },
        { from: "A", to: "Cee" },
      ]),
    );
    expect(svg).toContain("3 relations not drawn: Bee, Cee are not declared");
  });

  it("stops naming after four and counts the rest", async () => {
    const svg = await renderSvg(
      withEdges(["p", "q", "r", "s", "t", "u"].map((n) => ({ from: "A", to: n }))),
    );
    expect(svg).toContain("6 relations not drawn: p, q, r, s and 2 more are not declared");
  });

  it("says nothing when every relation is drawn", async () => {
    const svg = await renderSvg(withEdges([{ from: "A", to: "B" }]));
    // `pr-notice` is always in the stylesheet; the block itself is what counts.
    expect(svg).not.toContain('<g class="pr-notice">');
  });

  it("keeps the producer's own notice and adds its line below", async () => {
    const svg = await renderSvg({ ...withEdges([{ from: "A", to: "Bee" }]), notice: "Produced from a partial model." });
    expect(svg).toContain("Produced from a partial model.");
    expect(svg).toContain("1 relation not drawn: Bee");
  });

  it("leaves a document that drew nothing to its producer", async () => {
    const svg = await renderSvg({
      ir: 1 as const,
      nodes: [],
      edges: [{ from: "A", to: "B", kind: "association" as const }],
      notice: "Nothing drawn: 1 relation references entities that are not declared in this diagram.",
    });
    expect(svg).toContain("Nothing drawn: 1 relation references");
    expect(svg).not.toContain("not drawn: A");
  });
});

describe("the frame holds what is drawn", () => {
  it("reaches a relation's label, even when it sits outside the route", async () => {
    // A label placed to the left of its route used to fall outside the
    // viewBox and be clipped away, silently.
    const svg = await renderSvg({
      ir: 1 as const,
      nodes: [
        { id: "ini", kind: "start" as const, label: "" },
        { id: "A", kind: "action" as const, label: "Idle" },
        { id: "B", kind: "action" as const, label: "Running" },
      ],
      edges: [
        { from: "ini", to: "A", kind: "flow" as const },
        { from: "A", to: "B", kind: "flow" as const, label: "a long transition label" },
        { from: "B", to: "A", kind: "flow" as const, label: "back" },
      ],
    });
    const [, vx, vy, vw, vh] = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg)!.map(Number);
    const labels = [...svg.matchAll(/<text class="pr-edge-label" x="([\d.-]+)" y="([\d.-]+)">([^<]+)</g)];
    expect(labels.length).toBe(2);
    for (const [, x, y, text] of labels) {
      expect(+x).toBeGreaterThanOrEqual(vx);
      expect(+x + text.length * 7).toBeLessThanOrEqual(vx + vw);
      expect(+y).toBeGreaterThanOrEqual(vy);
      expect(+y).toBeLessThanOrEqual(vy + vh);
    }
  });
});
