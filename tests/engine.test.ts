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
  it("is byte-deterministic", () => {
    expect(renderSvg(IR)).toBe(renderSvg(IR));
  });

  it("emits stable ids, theming classes and typed markers", () => {
    const svg = renderSvg(IR);
    expect(svg).toContain('id="ns.Base"');
    expect(svg).toContain("pr-classifier-class");
    expect(svg).toContain("pr-abstract");
    expect(svg).toMatch(/marker-end="url\(#pr[0-9a-z]+-tri\)"/);
    expect(svg).toContain('data-id="ns.Base"');
    expect(svg).toContain("pr-edge-attachment");
    expect(svg).toContain("var(--pr-stroke");
    expect(svg).toContain("<title>demo</title>");
  });

  it("layers inheritance targets above sources", () => {
    const svg = renderSvg(IR);
    const y = (id: string) => {
      const match = svg.match(new RegExp(`id="${id}"[^>]*>\\s*<rect [^>]*y="(\\d+)"`));
      return Number(match?.[1]);
    };
    expect(y("ns.Base")).toBeLessThan(y("ns.Impl"));
  });

  it("escapes markup in labels", () => {
    const svg = renderSvg({
      ir: 1,
      nodes: [{ id: "a", kind: "box", label: "<X&Y>" }],
      edges: [],
    });
    expect(svg).toContain("&lt;X&amp;Y&gt;");
  });
});
