import { describe, expect, it } from "vitest";

import {
  filterMembers,
  flattenContainers,
  hideNotes,
  stripSections,
} from "../../src/render/filters.js";
import { type RenderIr } from "../../src/render/ir.js";

const IR: RenderIr = {
  ir: 1,
  nodes: [
    { id: "ns", kind: "container", label: "ns" },
    { id: "ns.A", kind: "box", label: "A", sections: [["+ x : int"]], parent: "ns" },
    {
      id: "ns.B",
      kind: "box",
      label: "B",
      sections: [
        ["+ id : str", "- _cache : dict"],
        ["+ run() : int", "- _step() : void"],
      ],
      sectionKinds: ["attributes", "methods"],
      parent: "ns",
    },
    { id: "ns.C", kind: "box", label: "C", sections: [["+ only() : int"]], sectionKinds: ["methods"] },
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
    expect(out.nodes).toHaveLength(5);
  });

  it("flattenContainers drops containers, parents and their edges", () => {
    const out = flattenContainers(IR);
    expect(out.nodes.map((n) => n.id)).toEqual(["ns.A", "ns.B", "ns.C", "note-1"]);
    expect(out.nodes[0].parent).toBeUndefined();
    expect(out.edges).toEqual([{ from: "note-1", to: "ns.A", kind: "attachment" }]);
  });

  it("hideNotes drops notes and attachments", () => {
    const out = hideNotes(IR);
    expect(out.nodes.map((n) => n.id)).toEqual(["ns", "ns.A", "ns.B", "ns.C"]);
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

describe("filterMembers", () => {
  const b = (ir: RenderIr) => ir.nodes.find((n) => n.id === "ns.B");

  it("keeps the members a predicate accepts", () => {
    const out = filterMembers(IR, (m) => m.startsWith("+"));
    expect(b(out)?.sections).toEqual([["+ id : str"], ["+ run() : int"]]);
  });

  it("drops a compartment once it empties, and its kind with it", () => {
    const out = filterMembers(IR, (_m, c) => c.kind !== "methods");
    expect(b(out)?.sections).toEqual([["+ id : str", "- _cache : dict"]]);
    expect(b(out)?.sectionKinds).toEqual(["attributes"]);
  });

  it("selects by kind where position would lie", () => {
    // ns.C has no attributes, so its methods sit at index 0. A consumer
    // counting compartments would hide the wrong one.
    const out = filterMembers(IR, (_m, c) => c.kind !== "methods");
    expect(out.nodes.find((n) => n.id === "ns.C")?.sections).toBeUndefined();
  });

  it("leaves a node with no members alone", () => {
    const out = filterMembers(IR, () => false);
    expect(out.nodes.find((n) => n.id === "ns")).toEqual(
      IR.nodes.find((n) => n.id === "ns"),
    );
    expect(out.nodes.find((n) => n.id === "ns.A")?.sections).toBeUndefined();
  });

  it("never mutates its input", () => {
    const before = JSON.stringify(IR);
    filterMembers(IR, (m) => m.startsWith("+"));
    expect(JSON.stringify(IR)).toBe(before);
  });
});
