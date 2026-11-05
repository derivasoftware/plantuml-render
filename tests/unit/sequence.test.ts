// @covers render.sequence.renderSequenceSvg
import { describe, expect, it } from "vitest";

import type { IrEdge, IrNode, RenderIr } from "../../src/render/ir.js";
import { renderSequenceSvg } from "../../src/render/sequence.js";
import { CHAR_W, LINE_H, PAD, idPrefix } from "../../src/render/shared.js";

// The layout's own constants, restated: a change to them is a change to the
// geometry these tests pin.
const MARGIN = 20;
const ROW_H = 30;
const HEAD_H = LINE_H + 2 * PAD;
const FIRST_ROW_TOP = MARGIN + HEAD_H + 16;

const doc = (nodes: IrNode[], edges: IrEdge[] = [], title?: string): RenderIr => ({ ir: 1, title, nodes, edges });
const life = (id: string, extra: Partial<IrNode> = {}): IrNode => ({ id, kind: "lifeline", label: id, ...extra });
const msg = (from: string, to: string, order: number, extra: Partial<IrEdge> = {}): IrEdge => ({ from, to, kind: "message", order, ...extra });
const num = (svg: string, pattern: RegExp): number => {
  const m = pattern.exec(svg);
  if (!m) throw new Error(`no match for ${pattern} in\n${svg}`);
  return Number(m[1]);
};
const laneX = (svg: string, id: string) =>
  num(svg, new RegExp(`data-id="${id}"[^>]*>(?:<title>[^<]*</title>)?<line class="pr-lifeline-line" x1="(-?\\d+)"`));
const rootAttr = (svg: string, name: string) => new RegExp(`<svg [^>]*?\\b${name}="([^"]*)"`).exec(svg)![1];
const rowTops = (svg: string) => rootAttr(svg, "data-row-tops").split(",").map(Number);
const rectOf = (svg: string, id: string) => {
  const m = new RegExp(`data-id="${id}"[^>]*>(?:<title>[^<]*</title>)?<rect x="(-?\\d+)" y="(-?\\d+)" width="(\\d+)" height="(\\d+)"`).exec(svg);
  if (!m) throw new Error(`no rect for ${id} in\n${svg}`);
  return { x: +m[1], y: +m[2], w: +m[3], h: +m[4] };
};
const headW = (label: string) => label.length * CHAR_W + 2 * PAD;

describe("renderSequenceSvg: the document", () => {
  it("sizes an empty diagram from its margins alone", () => {
    const svg = renderSequenceSvg(doc([]));
    const bottom = FIRST_ROW_TOP + PAD;
    expect(rootAttr(svg, "data-row-tops")).toBe(String(FIRST_ROW_TOP));
    expect(rootAttr(svg, "data-bottom")).toBe(String(bottom));
    expect(rootAttr(svg, "viewBox")).toBe(`0 0 ${MARGIN + 40 + MARGIN} ${bottom + MARGIN}`);
    expect(svg).not.toContain("<title>");
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it("escapes the title and derives the id prefix from it", () => {
    const title = "a < b";
    const svg = renderSequenceSvg(doc([life("A")], [], title));
    const px = idPrefix(title);
    expect(svg).toContain("<title>a &lt; b</title>");
    expect(svg).toContain(`<marker id="${px}arrow"`);
    expect(svg).toContain(`id="${px}A"`);
  });

  it("gives two titles different prefixes", () => {
    const one = renderSequenceSvg(doc([life("A")], [], "one"));
    const two = renderSequenceSvg(doc([life("A")], [], "two"));
    expect(one).toContain(`id="${idPrefix("one")}A"`);
    expect(two).toContain(`id="${idPrefix("two")}A"`);
    expect(idPrefix("one")).not.toBe(idPrefix("two"));
  });

  it("writes token overrides into the style, and nothing without them", () => {
    const plain = renderSequenceSvg(doc([life("A")]));
    const themed = renderSequenceSvg(doc([life("A")]), { "--pr-stroke": "#123456" });
    expect(themed).toContain(".pr-diagram { --pr-stroke: #123456; }");
    expect(plain).not.toContain("#123456");
  });

  it("is deterministic", () => {
    const ir = doc([life("A"), life("B")], [msg("A", "B", 0, { label: "hi" })], "same");
    expect(renderSequenceSvg(ir)).toBe(renderSequenceSvg(ir));
  });

  it("draws only the kinds it knows", () => {
    const svg = renderSequenceSvg(doc(
      [life("A"), { id: "Stray", kind: "box", label: "Stray" }],
      [{ from: "A", to: "A", kind: "association" }],
    ));
    expect(svg).not.toContain("Stray");
    expect(svg).not.toContain('class="pr-msg');
  });

  it("puts a notice under the last row and grows the height for it", () => {
    const bare = doc([life("A")]);
    const noted: RenderIr = { ...bare, notice: "not everything fits" };
    const svg = renderSequenceSvg(noted);
    expect(svg).toContain('class="pr-notice"');
    expect(svg).toContain("not everything fits");
    const height = (s: string) => Number(rootAttr(s, "height"));
    expect(height(svg)).toBeGreaterThan(height(renderSequenceSvg(bare)));
    expect(num(svg, /class="pr-notice"><rect x="\d+" y="(\d+)"/)).toBe(Number(rootAttr(svg, "data-bottom")) + MARGIN);
  });
});

describe("renderSequenceSvg: lifelines", () => {
  it("places the first lane after the margin and half its head", () => {
    const svg = renderSequenceSvg(doc([life("Front")]));
    expect(laneX(svg, "Front")).toBe(MARGIN + Math.ceil(headW("Front") / 2) + 16);
  });

  it("spaces lanes by their half-heads plus air when nothing crosses them", () => {
    const svg = renderSequenceSvg(doc([life("A"), life("Bravo")]));
    expect(laneX(svg, "Bravo") - laneX(svg, "A")).toBe(Math.ceil(headW("A") / 2) + Math.ceil(headW("Bravo") / 2) + 24);
  });

  it("draws a participant as a box carrying its classifier", () => {
    const svg = renderSequenceSvg(doc([life("DB", { label: "Store", classifier: "database" })]));
    expect(svg).toContain('class="pr-box pr-lifeline-head pr-classifier-database"');
    expect(svg).toContain(`y="${MARGIN}" width="${headW("Store")}" height="${HEAD_H}"/>`);
    expect(svg).toContain(">Store</text>");
  });

  it("draws an actor as a stick figure with its name centred below", () => {
    const svg = renderSequenceSvg(doc([life("U", { label: "User", classifier: "actor" })]));
    expect(svg).toContain('class="pr-actor"');
    expect(svg).toMatch(/<text class="pr-header" x="\d+" y="\d+" text-anchor="middle">User<\/text>/);
    expect(svg).not.toMatch(/data-id="U"[^>]*>\s*<rect/);
  });

  it("runs every lifeline down to the bottom", () => {
    const svg = renderSequenceSvg(doc([life("A")], [msg("A", "A", 2)]));
    expect(num(svg, /pr-lifeline-line" x1="\d+" y1="\d+" x2="\d+" y2="(\d+)"/)).toBe(Number(rootAttr(svg, "data-bottom")));
  });

  it("wraps a linked lifeline in an anchor, with its tooltip and refs", () => {
    const svg = renderSequenceSvg(doc([life("A", { href: "https://x.dev?a=1&b=2", title: "tip", refs: { req: ["R1", "R2"] } })]));
    expect(svg).toContain('<a href="https://x.dev?a=1&amp;b=2" class="pr-link">');
    expect(svg).toContain("<title>tip</title>");
    expect(svg).toContain('data-ref-req="R1 R2"');
  });
});

describe("renderSequenceSvg: messages", () => {
  it("draws one straight line between lanes, on its row", () => {
    const svg = renderSequenceSvg(doc([life("A"), life("B")], [msg("A", "B", 0)]));
    const [xa, xb] = [laneX(svg, "A"), laneX(svg, "B")];
    const y = FIRST_ROW_TOP + 20;
    expect(svg).toContain(`d="M${xa} ${y} L${xb} ${y}"`);
    expect(svg).toContain('class="pr-msg" data-from="A" data-to="B" data-order="0" data-row="0"');
  });

  it("runs a message right to left when it goes that way", () => {
    const svg = renderSequenceSvg(doc([life("A"), life("B")], [msg("B", "A", 0)]));
    const y = FIRST_ROW_TOP + 20;
    expect(svg).toContain(`d="M${laneX(svg, "B")} ${y} L${laneX(svg, "A")} ${y}"`);
  });

  it("marks a dashed message", () => {
    const svg = renderSequenceSvg(doc([life("A"), life("B")], [msg("A", "B", 0, { dashed: true })]));
    expect(svg).toContain('class="pr-msg pr-msg-dashed"');
  });

  it("gives each row a default height and reports the tops", () => {
    const svg = renderSequenceSvg(doc([life("A"), life("B")], [msg("A", "B", 0), msg("B", "A", 1)]));
    expect(rowTops(svg)).toEqual([FIRST_ROW_TOP, FIRST_ROW_TOP + ROW_H, FIRST_ROW_TOP + 2 * ROW_H]);
    expect(svg).toContain(`d="M${laneX(svg, "B")} ${FIRST_ROW_TOP + ROW_H + 20}`);
  });

  it("centres an escaped label above the line", () => {
    const label = "a<b";
    const svg = renderSequenceSvg(doc([life("A"), life("B")], [msg("A", "B", 0, { label })]));
    const mid = Math.round((laneX(svg, "A") + laneX(svg, "B")) / 2);
    const x = mid - Math.round((label.length * CHAR_W) / 2);
    expect(svg).toContain(`<text data-row="0" x="${x}" y="${FIRST_ROW_TOP + 20 - 5}">a&lt;b</text>`);
  });

  it("widens the gap to fit a long label", () => {
    const label = "x".repeat(60);
    const svg = renderSequenceSvg(doc([life("A"), life("B")], [msg("A", "B", 0, { label })]));
    expect(laneX(svg, "B") - laneX(svg, "A")).toBe(label.length * CHAR_W + 32);
  });

  it("shares a long label's room between the gaps it crosses", () => {
    const label = "x".repeat(61);
    const svg = renderSequenceSvg(doc([life("A"), life("B"), life("C")], [msg("A", "C", 0, { label })]));
    const [a, b, c] = ["A", "B", "C"].map((id) => laneX(svg, id));
    expect(c - a).toBe(label.length * CHAR_W + 32);
    expect(Math.abs(c - b - (b - a))).toBeLessThanOrEqual(1);
  });

  it("skips a message to a lane that does not exist", () => {
    const svg = renderSequenceSvg(doc([life("A")], [msg("A", "Ghost", 0, { label: "lost" })]));
    expect(svg).not.toContain('class="pr-msg');
    expect(svg).not.toContain("lost");
  });

  it("draws a self-message as a loop with its label beside it", () => {
    const svg = renderSequenceSvg(doc([life("A")], [msg("A", "A", 0, { label: "tick" })]));
    const x = laneX(svg, "A");
    const y = FIRST_ROW_TOP + 20;
    expect(svg).toContain('class="pr-msg pr-msg-self"');
    expect(svg).toContain(`d="M${x} ${y - 8} L${x + 32} ${y - 8} L${x + 32} ${y + 4} L${x + 4} ${y + 4}"`);
    expect(svg).toContain(`<text data-row="0" x="${x + 38}" y="${y}">tick</text>`);
  });

  it("makes room for a self-message's label: towards the next lane, or in the width on the last", () => {
    const label = "y".repeat(40);
    const extent = 32 + 6 + label.length * CHAR_W + 8;
    const middle = renderSequenceSvg(doc([life("A"), life("B")], [msg("A", "A", 0, { label })]));
    expect(laneX(middle, "B") - laneX(middle, "A")).toBe(extent + Math.ceil(headW("B") / 2));
    const last = renderSequenceSvg(doc([life("A")], [msg("A", "A", 0, { label })]));
    expect(Number(rootAttr(last, "width"))).toBe(laneX(last, "A") + extent + MARGIN);
  });

  it("links a message", () => {
    const svg = renderSequenceSvg(doc([life("A"), life("B")], [msg("A", "B", 0, { href: "https://x.dev", title: "why", refs: { ver: "V1" } })]));
    expect(svg).toMatch(/<a href="https:\/\/x\.dev" class="pr-link"><path [^>]*data-ref-ver="V1"><title>why<\/title><\/path><\/a>/);
  });
});

describe("renderSequenceSvg: notes", () => {
  const note = (id: string, label: string, anchor: string | undefined, classifier: string, at = 0): IrNode => ({ id, kind: "note", label, anchor, classifier, at });

  it("places a right note beside its lane and widens the gap for it", () => {
    const label = "z".repeat(30);
    const svg = renderSequenceSvg(doc([life("A"), life("B"), note("n", label, "A", "right")]));
    const w = label.length * CHAR_W + 2 * PAD;
    expect(rectOf(svg, "n")).toMatchObject({ x: laneX(svg, "A") + 16, w });
    expect(laneX(svg, "B") - laneX(svg, "A")).toBe(w + 24 + Math.ceil(headW("B") / 2));
  });

  it("places a left note before its lane when a lane precedes it", () => {
    const label = "z".repeat(30);
    const svg = renderSequenceSvg(doc([life("A"), life("B"), note("n", label, "B", "left")]));
    const w = label.length * CHAR_W + 2 * PAD;
    expect(rectOf(svg, "n").x).toBe(laneX(svg, "B") - w - 16);
    expect(rectOf(svg, "n").x).toBeGreaterThan(laneX(svg, "A"));
  });

  it("centres an over note on its lane", () => {
    const label = "z".repeat(31);
    const svg = renderSequenceSvg(doc([life("A"), life("B"), life("C"), note("n", label, "B", "over")]));
    const w = label.length * CHAR_W + 2 * PAD;
    expect(rectOf(svg, "n").x).toBe(laneX(svg, "B") - Math.round(w / 2));
    expect(laneX(svg, "B") - laneX(svg, "A")).toBeGreaterThanOrEqual(Math.ceil(w / 2) + 8);
    expect(laneX(svg, "C") - laneX(svg, "B")).toBeGreaterThanOrEqual(Math.ceil(w / 2) + 8);
  });

  it("puts a note with no known anchor past the last lane and grows the width", () => {
    const label = "z".repeat(30);
    const svg = renderSequenceSvg(doc([life("A"), note("n", label, undefined, "right")]));
    const rect = rectOf(svg, "n");
    expect(rect.x).toBeGreaterThan(laneX(svg, "A"));
    expect(Number(rootAttr(svg, "width"))).toBe(rect.x + rect.w + MARGIN);
  });

  it("splits lines on a real newline and on a written \\n, and grows the row to fit", () => {
    const svg = renderSequenceSvg(doc([life("A"), note("n", "one\ntwo\\nthree", "A", "right")]));
    for (const line of ["one", "two", "three"]) expect(svg).toContain(`>${line}</text>`);
    expect(rectOf(svg, "n").h).toBe(3 * LINE_H + PAD);
    const [top, next] = rowTops(svg);
    expect(next - top).toBe(3 * LINE_H + PAD + 10);
  });

  it("sets the note on the row it claims", () => {
    const svg = renderSequenceSvg(doc([life("A"), note("n", "one", "A", "right", 2)]));
    expect(svg).toMatch(/data-id="n" class="pr-note" data-row="2"/);
    expect(rectOf(svg, "n").y).toBe(rowTops(svg)[2]);
  });

  it("links a note", () => {
    const svg = renderSequenceSvg(doc([life("A"), { ...note("n", "one", "A", "right"), href: "https://x.dev" }]));
    expect(svg).toMatch(/<a href="https:\/\/x\.dev" class="pr-link"><g [^>]*data-id="n"/);
  });
});

describe("renderSequenceSvg: frames and dividers", () => {
  const frame = (id: string, label: string, span: [number, number], extra: Partial<IrNode> = {}): IrNode => ({ id, kind: "frame", label, span, ...extra });

  it("bounds a frame to the lanes its messages touch", () => {
    const svg = renderSequenceSvg(doc(
      [life("A"), life("B"), life("C"), frame("f", "alt cached", [0, 0])],
      [msg("A", "B", 0)],
    ));
    const rect = rectOf(svg, "f");
    const half = Math.ceil(headW("A") / 2);
    expect(rect.x).toBe(laneX(svg, "A") - half - 12);
    expect(rect.x + rect.w).toBeLessThan(laneX(svg, "C"));
    expect(svg).toContain('class="pr-frame pr-frame-alt pr-depth-0" data-span="0,0"');
  });

  it("leaves out a message outside its span", () => {
    const inside = renderSequenceSvg(doc(
      [life("A"), life("B"), life("C"), frame("f", "loop", [0, 0])],
      [msg("A", "B", 0), msg("A", "C", 1)],
    ));
    expect(rectOf(inside, "f").x + rectOf(inside, "f").w).toBeLessThan(laneX(inside, "C"));
  });

  it("spans all the lanes when nothing inside it pins the width", () => {
    const svg = renderSequenceSvg(doc([life("Alpha"), life("Bravo"), frame("f", "alt", [0, 0])]));
    const rect = rectOf(svg, "f");
    const laneR = laneX(svg, "Bravo") + Math.ceil(headW("Bravo") / 2) + 16;
    expect(rect.x).toBe(MARGIN);
    expect(rect.x + rect.w).toBe(laneR);
  });

  it("grows to fit a note inside it", () => {
    const label = "z".repeat(30);
    const svg = renderSequenceSvg(doc([
      life("A"),
      { id: "n", kind: "note", label, anchor: "A", classifier: "right", at: 0 },
      frame("f", "alt", [0, 0]),
    ]));
    const note = rectOf(svg, "n");
    const rect = rectOf(svg, "f");
    expect(rect.x + rect.w).toBe(note.x + note.w + 12);
  });

  it("is wide enough for its tab and condition however narrow its contents", () => {
    const condition = "c".repeat(40);
    const svg = renderSequenceSvg(doc([life("A"), frame("f", `alt ${condition}`, [0, 0])], [msg("A", "A", 0)]));
    const tabW = "alt".length * CHAR_W + 2 * PAD;
    const condW = condition.length * CHAR_W + 16;
    expect(rectOf(svg, "f").w).toBeGreaterThanOrEqual(tabW + condW + 12 + 8);
    expect(Number(rootAttr(svg, "width"))).toBeGreaterThanOrEqual(rectOf(svg, "f").x + rectOf(svg, "f").w + MARGIN);
  });

  it("draws the keyword on the tab and the condition in a pill", () => {
    const svg = renderSequenceSvg(doc([life("A"), frame("f", "loop retries left", [0, 1])], [msg("A", "A", 0), msg("A", "A", 1)]));
    expect(svg).toMatch(/<text class="pr-frame-label"[^>]*>loop<\/text>/);
    expect(svg).toContain('class="pr-frame pr-frame-loop');
    expect(svg).toMatch(/<g class="pr-branch" data-frame="f" data-branch="0" data-rows="0,1" data-row="0">/);
    expect(svg).toContain(">retries left</text>");
  });

  it("draws no pill for a frame with no condition", () => {
    const svg = renderSequenceSvg(doc([life("A"), frame("f", "par", [0, 0])], [msg("A", "A", 0)]));
    expect(svg).not.toContain('class="pr-branch"');
  });

  it("wraps a long condition and makes the head that much taller", () => {
    const condition = Array.from({ length: 16 }, () => "word").join(" "); // 79 characters, past the 56 wrap
    const svg = renderSequenceSvg(doc([life("A"), frame("f", `alt ${condition}`, [0, 0])], [msg("A", "A", 0)]));
    expect(num(svg, /data-head="(\d+)"/)).toBe(22 + (LINE_H - 4));
    expect(svg.match(/<g class="pr-branch".*?<\/g>/)![0].match(/<text /g)).toHaveLength(2);
  });

  it("gives the opening row a lead and the closing row a tail", () => {
    const plain = renderSequenceSvg(doc([life("A")], [msg("A", "A", 0)]));
    const framed = renderSequenceSvg(doc([life("A"), frame("f", "alt", [0, 0])], [msg("A", "A", 0)]));
    const height = (svg: string) => rowTops(svg)[1] - rowTops(svg)[0];
    expect(height(plain)).toBe(ROW_H);
    expect(height(framed)).toBe(ROW_H + (8 + 22) + (8 + 4));
    // the row's message moves down under the tab
    const y = FIRST_ROW_TOP + 8 + 22 + 20;
    expect(framed).toContain(`M${laneX(framed, "A")} ${y - 8} `);
  });

  it("cuts a frame into branches at each divider", () => {
    const svg = renderSequenceSvg(doc(
      [life("A"), frame("f", "alt first", [0, 3], { dividers: [{ at: 1, label: "second" }, { at: 3, label: "third" }] })],
      [0, 1, 2, 3].map((o) => msg("A", "A", o)),
    ));
    expect(svg.match(/class="pr-frame-divider" data-row="\d"/g)).toEqual([
      'class="pr-frame-divider" data-row="1"',
      'class="pr-frame-divider" data-row="3"',
    ]);
    expect(svg).toContain('data-branch="0" data-rows="0,0"');
    expect(svg).toContain('data-branch="1" data-rows="1,2"');
    expect(svg).toContain('data-branch="2" data-rows="3,3"');
    expect(svg).toContain(">second</text>");
    expect(svg).toContain(">third</text>");
  });

  it("insets a nested frame and stacks its tab when both open on one row", () => {
    const svg = renderSequenceSvg(doc(
      [life("A"), frame("outer", "alt", [0, 1]), frame("inner", "loop", [0, 0])],
      [msg("A", "A", 0), msg("A", "A", 1)],
    ));
    expect(svg).toContain('class="pr-frame pr-frame-alt pr-depth-0"');
    expect(svg).toContain('class="pr-frame pr-frame-loop pr-depth-1"');
    const [outer, inner] = [rectOf(svg, "outer"), rectOf(svg, "inner")];
    expect(inner.x - outer.x).toBe(14);
    expect(inner.y - outer.y).toBe(12);
  });

  it("does not treat a frame with the same span as nested", () => {
    const svg = renderSequenceSvg(doc(
      [life("A"), frame("one", "alt", [0, 0]), frame("two", "loop", [0, 0])],
      [msg("A", "A", 0)],
    ));
    expect(svg.match(/pr-depth-\d/g)).toEqual(["pr-depth-0", "pr-depth-0"]);
  });

  it("does not draw a frame without a span", () => {
    const svg = renderSequenceSvg(doc([life("A"), { id: "f", kind: "frame", label: "alt" }]));
    expect(svg).not.toContain('class="pr-frame ');
  });

  it("links a frame", () => {
    const svg = renderSequenceSvg(doc([life("A"), frame("f", "alt", [0, 0], { href: "https://x.dev" })]));
    expect(svg).toMatch(/<a href="https:\/\/x\.dev" class="pr-link"><g [^>]*data-id="f"/);
  });

  it("draws a divider as a band across the lanes on its row", () => {
    const svg = renderSequenceSvg(doc([life("Alpha"), { id: "d", kind: "divider", label: "phase two", at: 1 }]));
    const laneR = laneX(svg, "Alpha") + Math.ceil(headW("Alpha") / 2) + 16;
    expect(svg).toContain('data-id="d" class="pr-divider" data-row="1"');
    expect(rectOf(svg, "d")).toMatchObject({ x: MARGIN, w: laneR - MARGIN, h: 16, y: rowTops(svg)[1] + 6 });
    expect(svg).toContain(">phase two</text>");
    expect(rowTops(svg)).toHaveLength(3);
  });
});
