import { describe, expect, it } from "vitest";

import { renderSvg } from "../../src/render/engine.js";

const machine = (edges: object[]) => ({
  ir: 1 as const,
  nodes: [
    { id: "A", kind: "action" as const, label: "Idle" },
    { id: "B", kind: "action" as const, label: "Running" },
  ],
  edges: edges as never,
});

const drawn = (svg: string) => [...svg.matchAll(/data-from="A" data-to="B"/g)].length;
const size = (svg: string) => {
  const [, , , w, h] = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg)!.map(Number);
  return { w, h };
};

describe("relations that differ only in what they say", () => {
  const twenty = Array.from({ length: 20 }, (_, i) => ({
    from: "A",
    to: "B",
    kind: "flow",
    label: `ev${i} [g${i}]`,
    title: `disparador ev${i}`,
  }));

  it("are drawn as one, and the drawing stops being a detour", async () => {
    // A different link on each keeps them apart, which is the old drawing.
    const apart = await renderSvg(machine(twenty.map((e, i) => ({ ...e, href: `#r${i}` }))));
    const together = await renderSvg(machine(twenty));
    expect(drawn(together)).toBe(1);
    // Twenty channels, each wrapping the last, against one line.
    expect(size(together).w).toBeLessThan(size(apart).w / 4);
  });

  it("keep every word: the labels on the line, the explanations behind it", async () => {
    const svg = await renderSvg(machine(twenty));
    expect([...svg.matchAll(/<tspan /g)]).toHaveLength(20);
    const title = /<g class="pr-edge-group"[^>]*><title>([^<]*)<\/title>/.exec(svg)![1];
    expect(title.split("\n")).toHaveLength(20);
    expect(title).toContain("disparador ev19");
  });

  it("only collapse what is indistinguishable apart from its text", async () => {
    const kinds = await renderSvg(machine([
      { from: "A", to: "B", kind: "flow", label: "uno" },
      { from: "A", to: "B", kind: "association", label: "dos" },
    ]));
    expect(drawn(kinds)).toBe(2);

    const ways = await renderSvg({
      ...machine([
        { from: "A", to: "B", kind: "flow", label: "ida" },
        { from: "B", to: "A", kind: "flow", label: "vuelta" },
      ]),
    });
    expect(drawn(ways)).toBe(1);

    const links = await renderSvg(machine([
      { from: "A", to: "B", kind: "flow", label: "uno", href: "#a" },
      { from: "A", to: "B", kind: "flow", label: "dos", href: "#b" },
    ]));
    expect(drawn(links)).toBe(2);
  });

  it("leave a sequence alone, where each message is a row", async () => {
    const svg = await renderSvg({
      ir: 1 as const,
      nodes: [
        { id: "A", kind: "lifeline" as const, label: "A" },
        { id: "B", kind: "lifeline" as const, label: "B" },
      ],
      edges: [
        { from: "A", to: "B", kind: "message" as const, label: "uno", order: 0 },
        { from: "A", to: "B", kind: "message" as const, label: "dos", order: 1 },
      ],
    });
    expect([...svg.matchAll(/data-order=/g)]).toHaveLength(2);
  });

  it("drop a reference the group does not agree on", async () => {
    const svg = await renderSvg(machine([
      { from: "A", to: "B", kind: "flow", label: "uno", refs: { reqs: "REQ-1" } },
      { from: "A", to: "B", kind: "flow", label: "dos", refs: { reqs: "REQ-2" } },
    ]));
    expect(drawn(svg)).toBe(1);
    expect(svg).not.toContain("data-ref-reqs");
  });

  it("keeps a tall label inside the canvas", async () => {
    const svg = await renderSvg(machine(twenty));
    const [, vx, vy, vw, vh] = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg)!.map(Number);
    const text = /<text class="pr-edge-label" x="([\d.]+)" y="([\d.]+)"/.exec(svg)!;
    const [x, y] = [+text[1], +text[2]];
    expect(x).toBeGreaterThanOrEqual(vx);
    expect(y).toBeGreaterThanOrEqual(vy);
    expect(y + 19 * 14).toBeLessThanOrEqual(vy + vh);
    expect(x + 14 * 7).toBeLessThanOrEqual(vx + vw);
  });
});
