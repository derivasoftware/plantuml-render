// @covers render.links.applyLinks, render.links.entryFor, render.links.shortName
import { describe, expect, it } from "vitest";

import type { IrNode, RenderIr } from "../../src/render/ir.js";
import { applyLinks, entryFor, shortName } from "../../src/render/links.js";

const box = (id: string, rest: Partial<IrNode> = {}): IrNode => ({ id, kind: "box", label: id, ...rest });
const doc = (...nodes: IrNode[]): RenderIr => ({ ir: 1, title: "T", nodes, edges: [] });

describe("shortName", () => {
  it("is the last dotted segment", () => {
    expect(shortName("core.engine.Kernel")).toBe("Kernel");
  });

  it("is the id itself without a dot", () => {
    expect(shortName("Kernel")).toBe("Kernel");
    expect(shortName("")).toBe("");
  });

  it("is empty after a trailing dot", () => {
    expect(shortName("core.")).toBe("");
  });
});

describe("entryFor", () => {
  const node = box("core.Kernel");
  const owners = new Map([["Kernel", ["core.Kernel"]]]);

  it("turns a bare URL under the exact id into an href", () => {
    expect(entryFor(node, { "core.Kernel": "/k" }, owners)).toEqual({ href: "/k" });
  });

  it("returns link fields under the exact id as they are", () => {
    const entry = { href: "/k", title: "t", refs: { reqs: "R" } };
    expect(entryFor(node, { "core.Kernel": entry }, owners)).toBe(entry);
  });

  it("finds an entry by the short name when one node owns it", () => {
    expect(entryFor(node, { Kernel: "/short" }, owners)).toEqual({ href: "/short" });
    const entry = { title: "t" };
    expect(entryFor(node, { Kernel: entry }, owners)).toBe(entry);
  });

  it("prefers the exact id over the short name", () => {
    expect(entryFor(node, { "core.Kernel": "/exact", Kernel: "/short" }, owners)).toEqual({ href: "/exact" });
  });

  it("refuses a short name more than one node shares", () => {
    const shared = new Map([["Kernel", ["core.Kernel", "other.Kernel"]]]);
    expect(entryFor(node, { Kernel: "/short" }, shared)).toBeUndefined();
  });

  it("refuses a short name owned by another node", () => {
    const other = new Map([["Kernel", ["other.Kernel"]]]);
    expect(entryFor(node, { Kernel: "/short" }, other)).toBeUndefined();
  });

  it("refuses a short name the index does not know", () => {
    expect(entryFor(node, { Kernel: "/short" }, new Map())).toBeUndefined();
  });

  it("is undefined when the map says nothing about the node", () => {
    expect(entryFor(node, { Other: "/o" }, owners)).toBeUndefined();
  });
});

describe("applyLinks", () => {
  it("applies a bare URL and full link fields from the map", () => {
    const out = applyLinks(doc(box("A"), box("B")), {
      map: { A: "/a", B: { href: "/b", title: "bee", refs: { reqs: ["R1", "R2"] } } },
    });
    expect(out.nodes[0].href).toBe("/a");
    expect(out.nodes[1]).toEqual({ ...box("B"), href: "/b", title: "bee", refs: { reqs: ["R1", "R2"] } });
  });

  it("indexes short names itself: a unique one links, a shared one does not", () => {
    const out = applyLinks(doc(box("a.Solo"), box("a.Twin"), box("b.Twin")), {
      map: { Solo: "/solo", Twin: "/twin" },
    });
    expect(out.nodes.map((n) => n.href)).toEqual(["/solo", undefined, undefined]);
  });

  it("lets a map entry override what the IR carries", () => {
    const out = applyLinks(doc(box("A", { href: "/old", title: "old" })), { map: { A: { href: "/new" } } });
    expect(out.nodes[0].href).toBe("/new");
    expect(out.nodes[0].title).toBe("old");
  });

  it("merges refs key by key, the entry winning", () => {
    const out = applyLinks(doc(box("A", { refs: { reqs: "old", code: "kept" } })), {
      map: { A: { refs: { reqs: "new", tests: "added" } } },
    });
    expect(out.nodes[0].refs).toEqual({ reqs: "new", code: "kept", tests: "added" });
  });

  it("keeps the node's refs when the entry has none", () => {
    const out = applyLinks(doc(box("A", { refs: { reqs: "kept" } })), { map: { A: "/a" } });
    expect(out.nodes[0].refs).toEqual({ reqs: "kept" });
  });

  it("expands {id} and {name} in the template, every occurrence, URL-encoded", () => {
    const out = applyLinks(doc(box("a b.C/d")), { template: "/x/{id}/{name}/{id}" });
    expect(out.nodes[0].href).toBe("/x/a%20b.C%2Fd/C%2Fd/a%20b.C%2Fd");
  });

  it("uses the template only for what has no href yet", () => {
    const out = applyLinks(doc(box("carried", { href: "/ir" }), box("mapped"), box("free")), {
      map: { mapped: "/map" },
      template: "/t/{id}",
    });
    expect(out.nodes.map((n) => n.href)).toEqual(["/ir", "/map", "/t/free"]);
  });

  it("decorates boxes, lifelines and containers", () => {
    const nodes: IrNode[] = [box("b"), box("l", { kind: "lifeline" }), box("c", { kind: "container" })];
    const out = applyLinks(doc(...nodes), { template: "/t/{id}" });
    expect(out.nodes.map((n) => n.href)).toEqual(["/t/b", "/t/l", "/t/c"]);
  });

  it("returns every other kind untouched, even when the map names it", () => {
    const note = box("n", { kind: "note" });
    const port = box("p", { kind: "port" });
    const out = applyLinks(doc(note, port), { map: { n: "/n", p: "/p" }, template: "/t/{id}" });
    expect(out.nodes[0]).toBe(note);
    expect(out.nodes[1]).toBe(port);
    expect(out.nodes[0].href).toBeUndefined();
  });

  it("adds nothing with an empty spec, and keeps edges and document fields", () => {
    const edges: RenderIr["edges"] = [{ from: "A", to: "A", kind: "association" }];
    const ir: RenderIr = { ...doc(box("A")), edges };
    const out = applyLinks(ir, {});
    expect(out).toEqual(ir);
    expect(out.edges).toBe(edges);
  });

  it("leaves its input untouched", () => {
    const node = box("A", { refs: { reqs: "old" } });
    applyLinks(doc(node), { map: { A: { href: "/a", refs: { reqs: "new" } } } });
    expect(node).toEqual(box("A", { refs: { reqs: "old" } }));
  });
});
