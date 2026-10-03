import { describe, expect, it } from "vitest";

import { renderSequenceSvg } from "../../src/render/sequence.js";
import { type RenderIr } from "../../src/render/ir.js";

const lanes = (...ids: string[]) => ids.map((id) => ({ id, kind: "lifeline" as const, label: id, classifier: "participant" }));
const msg = (from: string, to: string, order: number, label?: string) => ({ from, to, kind: "message" as const, order, label });
const laneX = (svg: string, id: string) => Number(svg.match(new RegExp(`data-id="${id}"[^>]*>(?:<title>[^<]*</title>)?<line class="pr-lifeline-line" x1="(\\d+)"`))![1]);
const rowY = (svg: string, order: number) => Number(svg.match(new RegExp(`data-order="${order}"[^>]*d="M\\d+ (\\d+)`))![1]);
const frameRect = (svg: string) => svg.match(/class="pr-frame[^"]*"[^>]*>(?:<title>[^<]*<\/title>)?<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/)!.slice(1).map(Number);
const viewW = (svg: string) => Number(svg.match(/viewBox="0 0 (\d+) /)![1]);

describe("sequence layout", () => {
  it("widens only the gap a long label crosses", () => {
    const ir: RenderIr = { ir: 1, nodes: lanes("A", "B", "C", "D"), edges: [msg("A", "B", 0, "x"), msg("B", "C", 1, "a very long message label indeed()"), msg("C", "D", 2, "y")] };
    const svg = renderSequenceSvg(ir);
    const [a, b, c, d] = ["A", "B", "C", "D"].map((id) => laneX(svg, id));
    expect(b - a).toBe(d - c);
    expect(c - b).toBeGreaterThan(b - a + 100);
    expect(c - b).toBeGreaterThanOrEqual("a very long message label indeed()".length * 8 + 32);
  });

  it("gives a spanning label the room it needs across several gaps", () => {
    const ir: RenderIr = { ir: 1, nodes: lanes("A", "B", "C"), edges: [msg("A", "C", 0, "spanning label that is rather long()")] };
    const svg = renderSequenceSvg(ir);
    expect(laneX(svg, "C") - laneX(svg, "A")).toBeGreaterThanOrEqual("spanning label that is rather long()".length * 8 + 32);
  });

  it("bounds a frame to the lanes its messages touch", () => {
    const ir: RenderIr = {
      ir: 1,
      nodes: [...lanes("A", "B", "C", "D"), { id: "f", kind: "frame", label: "alt ok", span: [1, 1] }],
      edges: [msg("A", "D", 0, "wide"), msg("B", "C", 1, "narrow")],
    };
    const svg = renderSequenceSvg(ir);
    const [x, , w] = frameRect(svg);
    expect(x).toBeGreaterThan(laneX(svg, "A"));
    expect(x + w).toBeLessThan(laneX(svg, "D"));
    expect(x).toBeLessThan(laneX(svg, "B"));
    expect(x + w).toBeGreaterThan(laneX(svg, "C"));
  });

  it("grows a row to fit a multi-line note instead of overlapping the next message", () => {
    const base: RenderIr = { ir: 1, nodes: lanes("A", "B"), edges: [msg("A", "B", 0, "one"), msg("A", "B", 1, "two"), msg("A", "B", 2, "three")] };
    const withNote: RenderIr = { ...base, nodes: [...base.nodes, { id: "n", kind: "note", label: "l1\\nl2\\nl3\\nl4", at: 1, anchor: "B" }] };
    const plain = renderSequenceSvg(base);
    const noted = renderSequenceSvg(withNote);
    expect(rowY(plain, 2) - rowY(plain, 1)).toBe(rowY(plain, 1) - rowY(plain, 0));
    expect(rowY(noted, 2) - rowY(noted, 1)).toBeGreaterThan(rowY(noted, 1) - rowY(noted, 0));
    expect(rowY(noted, 2) - rowY(noted, 1)).toBeGreaterThanOrEqual(4 * 18 + 10);
  });

  it("keeps self-message loops and right-hand notes inside the frame", () => {
    const ir: RenderIr = {
      ir: 1,
      nodes: [...lanes("A", "B"), { id: "f", kind: "frame", label: "loop", span: [0, 1] }, { id: "n", kind: "note", label: "a note beside B", at: 1, anchor: "B" }],
      edges: [msg("B", "B", 0, "self()")],
    };
    const svg = renderSequenceSvg(ir);
    const [x, , w] = frameRect(svg);
    const bx = laneX(svg, "B");
    expect(x + w).toBeGreaterThan(bx + 32 + 6 + "self()".length * 8);
    expect(x + w).toBeGreaterThan(bx + 16 + "a note beside B".length * 8);
    expect(viewW(svg)).toBeGreaterThan(x + w);
  });

  it("stays deterministic and keeps lanes ordered", () => {
    const ir: RenderIr = { ir: 1, nodes: lanes("A", "B", "C"), edges: [msg("C", "A", 0, "back"), msg("A", "B", 1)] };
    const svg = renderSequenceSvg(ir);
    expect(renderSequenceSvg(ir)).toBe(svg);
    expect(laneX(svg, "A")).toBeLessThan(laneX(svg, "B"));
    expect(laneX(svg, "B")).toBeLessThan(laneX(svg, "C"));
  });
});

describe("sequence frames", () => {
  const frame = (id: string, label: string, span: [number, number], dividers?: { at: number; label: string }[]) =>
    ({ id, kind: "frame" as const, label, span, dividers });
  const rects = (svg: string) =>
    [...svg.matchAll(/data-id="([^"]+)" class="(pr-frame[^"]*)"[^>]*>(?:<title>[^<]*<\/title>)?<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/g)].map((m) => ({
      id: m[1], cls: m[2], x: +m[3], y: +m[4], w: +m[5], h: +m[6],
    }));

  it("leaves air above and below a frame and after each else, and insets nested frames", () => {
    const ir: RenderIr = {
      ir: 1,
      nodes: [...lanes("A", "B"), frame("outer", "alt outer", [1, 4], [{ at: 3, label: "otherwise" }]), frame("inner", "loop each", [2, 2])],
      edges: [msg("A", "B", 0, "before"), msg("A", "B", 1, "first"), msg("A", "B", 2, "looped"), msg("B", "A", 3, "else one"), msg("B", "A", 4, "last"), msg("A", "B", 5, "after")],
    };
    const svg = renderSequenceSvg(ir);
    const [outer, inner] = rects(svg);
    expect(outer.y - rowY(svg, 0)).toBeGreaterThanOrEqual(8 + 10); // the row's own bottom plus 8 px of air
    expect(rowY(svg, 1) - outer.y).toBeGreaterThanOrEqual(22); // the tab band before the first message
    expect(rowY(svg, 5) - (outer.y + outer.h)).toBeGreaterThanOrEqual(8 + 10); // air before the next arrow
    expect(inner.x - outer.x).toBeGreaterThanOrEqual(14);
    expect(outer.y + outer.h - (inner.y + inner.h)).toBeGreaterThanOrEqual(8); // nested borders do not touch
    const divider = Number(svg.match(/pr-frame-divider" data-row="3"[^>]*y1="(\d+)"/)![1]);
    expect(divider - rowY(svg, 2)).toBeGreaterThanOrEqual(8);
    expect(rowY(svg, 3) - divider).toBeGreaterThanOrEqual(18); // the else label has its own room
  });

  it("colours frames by kind and wraps a long condition into the tab band", () => {
    const cond = "the host answers within the timeout and the branch exists on the remote";
    const ir: RenderIr = {
      ir: 1,
      nodes: [...lanes("A", "B"), frame("f1", `alt ${cond}`, [0, 0]), frame("f2", "loop x", [1, 1]), frame("f3", "opt y", [2, 2]), frame("f4", "par", [3, 3])],
      edges: [0, 1, 2, 3].map((o) => msg("A", "B", o, "m")),
    };
    const svg = renderSequenceSvg(ir);
    expect(rects(svg).map((r) => r.cls)).toEqual(["pr-frame pr-frame-alt pr-depth-0", "pr-frame pr-frame-loop pr-depth-0", "pr-frame pr-frame-opt pr-depth-0", "pr-frame pr-frame-par pr-depth-0"]);
    expect(svg).toContain("--pr-frame-alt:");
    expect(svg).toContain("--pr-frame-loop:");
    const pill = svg.match(/<g class="pr-branch" data-frame="f1"[^>]*>(.*?)<\/g>/)![1];
    expect((pill.match(/<text /g) ?? []).length).toBe(2); // wrapped
    expect(rects(svg)[0].w).toBeLessThan(cond.length * 8); // the frame did not stretch to the whole condition
  });

  it("exposes rows, spans and branches to a host page", () => {
    const ir: RenderIr = {
      ir: 1,
      nodes: [...lanes("A", "B"), frame("f", "alt ok", [0, 2], [{ at: 1, label: "retry" }, { at: 2, label: "fail" }]), { id: "n", kind: "note", label: "hint", at: 2, anchor: "B" }],
      edges: [msg("A", "B", 0, "go"), msg("B", "A", 1, "again"), msg("B", "A", 2, "no")],
    };
    const svg = renderSequenceSvg(ir);
    expect(svg).toMatch(/<svg data-row-tops="\d+(,\d+){3}"/);
    expect(svg).toContain('data-span="0,2"');
    const branches = [...svg.matchAll(/<g class="pr-branch" data-frame="f" data-branch="(\d)" data-rows="([^"]+)" data-row="(\d)"/g)].map((m) => [m[1], m[2], m[3]]);
    expect(branches).toEqual([["0", "0,0", "0"], ["1", "1,1", "1"], ["2", "2,2", "2"]]);
    for (const order of [0, 1, 2]) expect(svg).toContain(`data-order="${order}" data-row="${order}"`);
    expect(svg).toContain('class="pr-note" data-row="2"');
    expect(renderSequenceSvg(ir)).toBe(svg);
  });
});
