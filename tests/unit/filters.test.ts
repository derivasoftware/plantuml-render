// @covers render.filters.filterMembers, render.filters.flattenContainers, render.filters.hideNotes, render.filters.stripSections
import { describe, expect, it, vi } from "vitest";

import { filterMembers, flattenContainers, hideNotes, stripSections } from "../../src/render/filters.js";
import type { IrNode, RenderIr } from "../../src/render/ir.js";

const doc = (nodes: IrNode[], edges: RenderIr["edges"] = []): RenderIr => ({ ir: 1, title: "T", nodes, edges });
const box = (id: string, rest: Partial<IrNode> = {}): IrNode => ({ id, kind: "box", label: id, ...rest });

describe("stripSections", () => {
  it("removes the compartments and nothing else from a node", () => {
    const ir = doc([box("A", { sections: [["+a"], ["+b()"]], stereotype: "s", href: "/a" })]);
    expect(stripSections(ir).nodes).toEqual([{ id: "A", kind: "box", label: "A", stereotype: "s", href: "/a" }]);
  });

  it("keeps nodes without compartments, edges and the document's own fields", () => {
    const edges: RenderIr["edges"] = [{ from: "A", to: "B", kind: "association" }];
    const ir = { ...doc([box("A"), box("B")], edges), notice: "n" };
    expect(stripSections(ir)).toEqual(ir);
  });

  it("leaves its input untouched", () => {
    const ir = doc([box("A", { sections: [["+a"]] })]);
    stripSections(ir);
    expect(ir.nodes[0].sections).toEqual([["+a"]]);
  });
});

describe("flattenContainers", () => {
  const ir = doc(
    [
      { id: "pkg", kind: "container", label: "pkg" },
      { id: "sub", kind: "container", label: "sub", parent: "pkg" },
      box("A", { parent: "sub" }),
      box("B", { parent: "pkg", label: "Bee" }),
      box("C"),
    ],
    [
      { from: "A", to: "B", kind: "association" },
      { from: "A", to: "pkg", kind: "dependency" },
      { from: "sub", to: "C", kind: "dependency" },
    ],
  );

  it("drops every container, nested ones included", () => {
    expect(flattenContainers(ir).nodes.map((n) => n.id)).toEqual(["A", "B", "C"]);
  });

  it("lifts the boxes out of their containers, keeping their other fields", () => {
    expect(flattenContainers(ir).nodes).toEqual([
      { id: "A", kind: "box", label: "A" },
      { id: "B", kind: "box", label: "Bee" },
      { id: "C", kind: "box", label: "C" },
    ]);
  });

  it("drops the edges with a container at either end and keeps the rest", () => {
    expect(flattenContainers(ir).edges).toEqual([{ from: "A", to: "B", kind: "association" }]);
  });

  it("keeps the document's own fields and leaves its input untouched", () => {
    const out = flattenContainers(ir);
    expect(out.title).toBe("T");
    expect(ir.nodes).toHaveLength(5);
    expect(ir.nodes[2].parent).toBe("sub");
    expect(ir.edges).toHaveLength(3);
  });
});

describe("hideNotes", () => {
  const ir = doc(
    [box("A"), { id: "n1", kind: "note", label: "hello" }, { id: "pkg", kind: "container", label: "pkg" }],
    [
      { from: "n1", to: "A", kind: "attachment" },
      { from: "A", to: "n1", kind: "attachment" },
      { from: "A", to: "pkg", kind: "dependency" },
    ],
  );

  it("drops the notes and only the notes", () => {
    expect(hideNotes(ir).nodes.map((n) => n.id)).toEqual(["A", "pkg"]);
  });

  it("drops the edges with a note at either end and keeps the rest", () => {
    expect(hideNotes(ir).edges).toEqual([{ from: "A", to: "pkg", kind: "dependency" }]);
  });

  it("changes nothing on a document with no note", () => {
    const plain = doc([box("A")], [{ from: "A", to: "A", kind: "association" }]);
    expect(hideNotes(plain)).toEqual(plain);
  });

  it("leaves its input untouched", () => {
    hideNotes(ir);
    expect(ir.nodes).toHaveLength(3);
    expect(ir.edges).toHaveLength(3);
  });
});

describe("filterMembers", () => {
  const typed = box("A", {
    sections: [
      ["+a", "-b"],
      ["+c()", "-d()"],
    ],
    sectionKinds: ["attributes", "methods"],
  });

  it("keeps the members the predicate accepts, compartment by compartment", () => {
    const [out] = filterMembers(doc([typed]), (m) => m.startsWith("+")).nodes;
    expect(out.sections).toEqual([["+a"], ["+c()"]]);
    expect(out.sectionKinds).toEqual(["attributes", "methods"]);
  });

  it("hands the predicate the node, the compartment's kind and its index", () => {
    const keep = vi.fn(() => true);
    filterMembers(doc([typed]), keep);
    expect(keep.mock.calls).toEqual([
      ["+a", { node: typed, kind: "attributes", section: 0 }],
      ["-b", { node: typed, kind: "attributes", section: 0 }],
      ["+c()", { node: typed, kind: "methods", section: 1 }],
      ["-d()", { node: typed, kind: "methods", section: 1 }],
    ]);
  });

  it("drops a compartment once empty, and its kind stays aligned with what is left", () => {
    const [out] = filterMembers(doc([typed]), (_, c) => c.kind !== "attributes").nodes;
    expect(out.sections).toEqual([["+c()", "-d()"]]);
    expect(out.sectionKinds).toEqual(["methods"]);
  });

  it("removes both fields when nothing is left, keeping the rest of the node", () => {
    const [out] = filterMembers(doc([{ ...typed, stereotype: "s" }]), () => false).nodes;
    expect(out).toEqual({ id: "A", kind: "box", label: "A", stereotype: "s" });
  });

  it("works on compartments with no kinds, and gives the predicate none", () => {
    const untyped = box("A", { sections: [["x", "y"]] });
    const seen: unknown[] = [];
    const [out] = filterMembers(doc([untyped]), (m, c) => {
      seen.push(c.kind);
      return m === "x";
    }).nodes;
    expect(out).toEqual({ id: "A", kind: "box", label: "A", sections: [["x"]] });
    expect(seen).toEqual([undefined, undefined]);
  });

  it("omits the kinds when they no longer cover every compartment left", () => {
    const partial = box("A", { sections: [["x"], ["y"]], sectionKinds: ["methods"] });
    const [out] = filterMembers(doc([partial]), () => true).nodes;
    expect(out.sections).toEqual([["x"], ["y"]]);
    expect(out).not.toHaveProperty("sectionKinds");
  });

  it("does not consult the predicate for a node with no compartments, and returns it as is", () => {
    const bare = box("B");
    const keep = vi.fn(() => false);
    const out = filterMembers(doc([bare]), keep);
    expect(out.nodes[0]).toBe(bare);
    expect(keep).not.toHaveBeenCalled();
  });

  it("keeps the edges and the document's own fields, and leaves its input untouched", () => {
    const edges: RenderIr["edges"] = [{ from: "A", to: "A", kind: "association" }];
    const ir = doc([typed], edges);
    const out = filterMembers(ir, () => false);
    expect(out.edges).toEqual(edges);
    expect(out.title).toBe("T");
    expect(typed.sections).toEqual([
      ["+a", "-b"],
      ["+c()", "-d()"],
    ]);
  });
});
