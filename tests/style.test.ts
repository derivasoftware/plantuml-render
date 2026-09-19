import { describe, expect, it } from "vitest";

import { renderSvg } from "../src/render/engine.js";
import { renderSequenceSvg } from "../src/render/sequence.js";
import { BADGE, memberMarkup } from "../src/render/shared.js";

const box = (id: string, extra: Record<string, unknown> = {}) => ({ id, kind: "box" as const, label: id.split(".").pop()!, ...extra });

describe("visual style", () => {
  it("tokenises members: visibility, static and abstract, name, params, types", async () => {
    const m = memberMarkup("+ {static} {abstract} load(path: str, opts: dict[str, int]) : Repo | None");
    expect(m.visibility).toBe("public");
    expect(m.inner).toContain('class="pr-name pr-static pr-abstract-member">load<');
    expect(m.inner).toContain('<tspan class="pr-param">opts</tspan><tspan class="pr-punct">: </tspan><tspan class="pr-type">dict[str, int]</tspan>');
    expect(m.inner).toContain('<tspan class="pr-type">Repo | None</tspan>');
    expect(memberMarkup("- count : int")).toEqual({
      visibility: "private",
      inner: '<tspan class="pr-name">count</tspan><tspan class="pr-punct"> : </tspan><tspan class="pr-type">int</tspan>',
    });
    expect(memberMarkup("# a").visibility).toBe("protected");
    expect(memberMarkup("~ b()").visibility).toBe("package");
    expect(memberMarkup("RECIBIDO")).toEqual({ visibility: undefined, inner: '<tspan class="pr-name">RECIBIDO</tspan>' });
    expect(memberMarkup("+ f(x: list<a, b>, y: int)").inner.match(/pr-param/g)).toHaveLength(2);
    expect(memberMarkup("+ <X&Y> : T").inner).toContain("&lt;X&amp;Y&gt;");
  });

  it("draws visibility dots, a header band and a classifier badge per kind", async () => {
    const svg = await renderSvg({
      ir: 1,
      title: "CL_Kinds",
      nodes: [
        box("a.C", { classifier: "class", sections: [["+ x : int", "- y : str"], ["# run() : None"]] }),
        box("a.I", { classifier: "interface" }),
        box("a.E", { classifier: "enum", sections: [["ONE", "TWO"]] }),
        box("a.f", { stereotype: "function" }),
        box("a.A", { abstract: true }),
      ],
      edges: [],
    });
    expect(svg.match(/class="pr-vis pr-vis-public"/g)).toHaveLength(1);
    expect(svg.match(/class="pr-vis pr-vis-private"/g)).toHaveLength(1);
    expect(svg.match(/class="pr-vis pr-vis-protected"/g)).toHaveLength(1);
    expect(svg).not.toContain('class="pr-vis pr-vis-package"');
    for (const letter of ["C", "I", "E", "f", "A"]) expect(svg).toContain(`text-anchor="middle">${letter}</text>`);
    expect(svg.match(/class="pr-head"/g)).toHaveLength(5);
    expect(svg).toContain("pr-classifier-function");
    expect(svg).toContain("pr-stereotype-function");
    expect(svg).toContain('class="pr-stereo"');
    expect(BADGE.interface).toBe("I");
  });

  it("breaks note lines on the PlantUML \\\\n escape and folds the corner", async () => {
    const svg = await renderSvg({
      ir: 1,
      title: "CL_Note",
      nodes: [box("A"), { id: "n1", kind: "note", label: "first\\nsecond" }],
      edges: [{ from: "n1", to: "A", kind: "attachment" }],
    });
    expect(svg).toContain(">first</text>");
    expect(svg).toContain(">second</text>");
    expect(svg).not.toContain("\\n");
    expect(svg.match(/<g id="[^"]+" data-id="n1" class="pr-note"><path d="M/)).toBeTruthy();
  });

  it("paints containers parent-first and edge labels above the leaves", async () => {
    const svg = await renderSvg({
      ir: 1,
      title: "CL_Order",
      nodes: [
        { id: "outer", kind: "container", label: "outer" },
        { id: "outer.inner", kind: "container", label: "inner", parent: "outer" },
        box("outer.inner.A", { parent: "outer.inner" }),
        box("outer.inner.B", { parent: "outer.inner" }),
      ],
      edges: [{ from: "outer.inner.A", to: "outer.inner.B", kind: "association", label: "uses" }],
    });
    const at = (needle: string) => svg.indexOf(needle);
    expect(at('data-id="outer"')).toBeLessThan(at('data-id="outer.inner"'));
    expect(at('data-id="outer.inner"')).toBeLessThan(at('data-id="outer.inner.A"'));
    expect(at('class="pr-edge pr-edge-association"')).toBeLessThan(at('data-id="outer.inner.A"'));
    expect(at('class="pr-edge-label"')).toBeGreaterThan(at('data-id="outer.inner.B"'));
    expect(svg).toContain("paint-order: stroke");
  });

  it("styles the sequence: actor glyph, frame tab with condition, note line breaks", async () => {
    const svg = renderSequenceSvg({
      ir: 1,
      title: "SEQ_Style",
      nodes: [
        { id: "u", kind: "lifeline", label: "User", classifier: "actor" },
        { id: "s", kind: "lifeline", label: "Svc", classifier: "participant" },
        { id: "f", kind: "frame", label: "alt has stock", span: [0, 1], dividers: [{ at: 1, label: "else" }] },
        { id: "n", kind: "note", label: "one\\ntwo", at: 1, anchor: "s" },
      ],
      edges: [
        { from: "u", to: "s", kind: "message", label: "buy()", order: 0 },
        { from: "s", to: "u", kind: "message", label: "ok", order: 1, dashed: true },
      ],
    });
    expect(svg).toContain('class="pr-actor"');
    expect(svg).toContain('class="pr-frame-tab"');
    expect(svg).toContain('class="pr-frame-label" x="');
    expect(svg).toContain(">alt</text>");
    expect(svg).toContain('class="pr-frame-cond"');
    expect(svg).toContain(">[has stock]</text>");
    expect(svg).toContain(">one</text>");
    expect(svg).toContain(">two</text>");
  });

  it("declares the palette as overridable tokens in light and dark", async () => {
    const svg = await renderSvg({ ir: 1, title: "CL_T", nodes: [box("A")], edges: [] });
    for (const token of ["--pr-type", "--pr-vis-public", "--pr-head-interface", "--pr-badge-enum", "--pr-note-stroke", "--pr-edge"]) {
      expect(svg.split(token).length).toBeGreaterThanOrEqual(3); // light block + two dark blocks
    }
  });
});
