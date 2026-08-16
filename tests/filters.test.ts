import { describe, expect, it } from "vitest";

import { flattenContainers, hideNotes, stripSections } from "../src/render/filters.js";
import { type RenderIr } from "../src/render/ir.js";

const IR: RenderIr = {
  ir: 1,
  nodes: [
    { id: "ns", kind: "container", label: "ns" },
    { id: "ns.A", kind: "box", label: "A", sections: [["+ x : int"]], parent: "ns" },
    { id: "note-1", kind: "note", label: "hint" },
  ],
  edges: [
    { from: "ns.A", to: "ns", kind: "association" },
    { from: "note-1", to: "ns.A", kind: "attachment" },
  ],
};

describe("view filters", () => {
  it("stripSections removes compartments only", () => {
    const out = stripSections(IR);
    expect(out.nodes.find((n) => n.id === "ns.A")?.sections).toBeUndefined();
    expect(out.nodes).toHaveLength(3);
  });

  it("flattenContainers drops containers, parents and their edges", () => {
    const out = flattenContainers(IR);
    expect(out.nodes.map((n) => n.id)).toEqual(["ns.A", "note-1"]);
    expect(out.nodes[0].parent).toBeUndefined();
    expect(out.edges).toEqual([{ from: "note-1", to: "ns.A", kind: "attachment" }]);
  });

  it("hideNotes drops notes and attachments", () => {
    const out = hideNotes(IR);
    expect(out.nodes.map((n) => n.id)).toEqual(["ns", "ns.A"]);
    expect(out.edges).toEqual([{ from: "ns.A", to: "ns", kind: "association" }]);
  });

  it("filters never mutate their input", () => {
    const before = JSON.stringify(IR);
    stripSections(IR);
    flattenContainers(IR);
    hideNotes(IR);
    expect(JSON.stringify(IR)).toBe(before);
  });
});
