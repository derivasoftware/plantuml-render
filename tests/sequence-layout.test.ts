import { describe, expect, it } from "vitest";

import { renderSequenceSvg } from "../src/render/sequence.js";
import { type RenderIr } from "../src/render/ir.js";

const lanes = (...ids: string[]) => ids.map((id) => ({ id, kind: "lifeline" as const, label: id, classifier: "participant" }));
const msg = (from: string, to: string, order: number, label?: string) => ({ from, to, kind: "message" as const, order, label });
const laneX = (svg: string, id: string) => Number(svg.match(new RegExp(`data-id="${id}"[^>]*>(?:<title>[^<]*</title>)?<line class="pr-lifeline-line" x1="(\\d+)"`))![1]);
const rowY = (svg: string, order: number) => Number(svg.match(new RegExp(`data-order="${order}"[^>]*d="M\\d+ (\\d+)`))![1]);
const frameRect = (svg: string) => svg.match(/class="pr-frame"[^>]*>(?:<title>[^<]*<\/title>)?<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/)!.slice(1).map(Number);
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
