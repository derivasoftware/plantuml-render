import { describe, expect, it } from "vitest";

import { renderSvg } from "../src/render/engine.js";
import { idPrefix } from "../src/render/shared.js";

const classIr = (title: string) => ({
  ir: 1 as const,
  title,
  nodes: [
    { id: "ns", kind: "container" as const, label: "ns" },
    { id: "ns.A", kind: "box" as const, label: "A", parent: "ns", sections: [["+ x : int"]] },
    { id: "ns.B", kind: "box" as const, label: "B", parent: "ns" },
  ],
  edges: [{ from: "ns.B", to: "ns.A", kind: "inheritance" as const }],
});

const seqIr = {
  ir: 1 as const,
  title: "SEQ_Demo",
  nodes: [
    { id: "A", kind: "lifeline" as const, label: "A", classifier: "participant" },
    { id: "B", kind: "lifeline" as const, label: "B", classifier: "participant" },
  ],
  edges: [{ from: "A", to: "B", kind: "message" as const, label: "go()", order: 0 }],
};

const ids = (svg: string) => [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
const rules = (svg: string) =>
  (svg.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "")
    .split("}")
    .map((r) => r.replace(/@media[^{]*\{/, "").trim())
    .filter((r) => r.includes("{"))
    .map((r) => r.slice(0, r.indexOf("{")).trim());

describe("embedding", () => {
  it("scopes every style rule under .pr-diagram and never targets the host root", () => {
    for (const svg of [renderSvg(classIr("CL_A")), renderSvg(seqIr)]) {
      const selectors = rules(svg);
      expect(selectors.length).toBeGreaterThan(5);
      for (const sel of selectors) {
        for (const part of sel.split(",")) expect(part.trim()).toMatch(/(^|\s|\])\.pr-diagram(\s|$|\.|:)/);
      }
      expect(svg).not.toMatch(/:root\s*\{/);
    }
  });

  it("keeps ids unique across diagrams while the logical id stays in data-id", () => {
    const a = renderSvg(classIr("CL_A"));
    const b = renderSvg(classIr("CL_B"));
    const shared = ids(a).filter((id) => ids(b).includes(id));
    expect(shared).toEqual([]);
    expect(new Set(ids(a)).size).toBe(ids(a).length);
    expect(a).toContain('data-id="ns.A"');
    expect(a).toContain(`id="${idPrefix("CL_A")}ns.A"`);
    expect(a).toMatch(new RegExp(`marker-end="url\\(#${idPrefix("CL_A")}tri\\)"`));
  });

  it("derives the prefix deterministically from the title", () => {
    expect(idPrefix("CL_A")).toBe(idPrefix("CL_A"));
    expect(idPrefix("CL_A")).not.toBe(idPrefix("CL_B"));
    expect(idPrefix(undefined)).toMatch(/^pr[0-9a-z]+-$/);
  });

  it("declares light and dark tokens on the diagram itself", () => {
    const svg = renderSvg(classIr("CL_A"));
    expect(svg).toContain("prefers-color-scheme: dark");
    expect(svg).toContain('[data-theme="dark"] .pr-diagram');
    expect(svg).toMatch(/\.pr-diagram \{[^}]*--pr-text:/);
  });

  it("sizes the root naturally and fluidly", () => {
    const svg = renderSvg(classIr("CL_A"));
    const root = svg.match(/<svg [^>]+>/)![0];
    expect(root).toMatch(/viewBox="-?\d+ -?\d+ \d+ \d+"/);
    expect(root).toMatch(/ width="\d+" height="\d+"/);
    expect(root).toContain('style="max-width:100%;height:auto"');
  });

  it("frames the content with the same margin on every side", () => {
    const svg = renderSvg(classIr("CL_A"));
    const [, vx, vy, vw, vh] = svg.match(/viewBox="(-?\d+) (-?\d+) (\d+) (\d+)"/)!.map(Number);
    const boxes = [...svg.matchAll(/<rect x="(-?\d+)" y="(-?\d+)" width="(\d+)" height="(\d+)"/g)].map((m) => m.slice(1).map(Number));
    const left = Math.min(...boxes.map((b) => b[0])) - vx;
    const top = Math.min(...boxes.map((b) => b[1])) - vy;
    const right = vx + vw - Math.max(...boxes.map((b) => b[0] + b[2]));
    const bottom = vy + vh - Math.max(...boxes.map((b) => b[1] + b[3]));
    expect([left, top, right, bottom]).toEqual([left, left, left, left]);
  });
});
