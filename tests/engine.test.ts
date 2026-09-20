import { describe, expect, it } from "vitest";

import { renderSvg } from "../src/render/engine.js";

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
