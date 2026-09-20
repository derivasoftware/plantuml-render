import { describe, expect, it } from "vitest";

import { renderSvg } from "../src/render/engine.js";
import { pumlToIr } from "../src/render/frontend.js";
import { type RenderIr, validateIr } from "../src/render/ir.js";

const kinds = (ir: RenderIr) => ir.nodes.map((n) => n.kind);
const flows = (ir: RenderIr) =>
  ir.edges.filter((e) => e.kind === "flow").map((e) => `${e.from}>${e.to}${e.label ? ":" + e.label : ""}`);

const ISSUE = "@startuml demo2\nstart\n:Read input;\nif (valid?) then (yes)\n  :Process;\nelse (no)\n  :Reject;\nendif\nstop\n@enduml\n";

describe("activity frontend", () => {
  it("folds if/elseif/else with branch labels into chained decisions", async () => {
    const ir = await pumlToIr(
      "@startuml\nstart\n:a;\nif (x?) then (yes)\n  :b;\nelseif (y?) then (maybe)\n  :c;\nelse (no)\n  :d;\nendif\n:e;\nstop\n@enduml\n",
    );
    expect(kinds(ir)).toEqual(["start", "action", "decision", "action", "decision", "action", "action", "action", "end"]);
    expect(flows(ir)).toEqual([
      "start-1>action-1",
      "action-1>decision-1",
      "decision-1>action-2:yes",
      "decision-1>decision-2",
      "decision-2>action-3:maybe",
      "decision-2>action-4:no",
      "action-2>action-5",
      "action-3>action-5",
      "action-4>action-5",
      "action-5>stop-1",
    ]);
    expect(ir.nodes.find((n) => n.id === "decision-1")!.label).toBe("x?");
  });

  it("turns while with break and repeat with backward into back edges", async () => {
    const ir = await pumlToIr(
      "@startuml\nstart\nwhile (more?) is (yes)\n  :step;\n  if (bad?) then (yes)\n    break\n  endif\nendwhile (no)\nrepeat :init;\n  :work;\n  backward:undo;\nrepeat while (again?) is (yes) not (no)\nstop\n@enduml\n",
    );
    expect(flows(ir)).toEqual(
      expect.arrayContaining([
        "decision-1>action-1:yes",
        "decision-2>decision-1",
        "decision-1>action-2:no",
        "decision-2>action-2:yes",
        "action-3>decision-3",
        "decision-3>action-4:yes",
        "action-4>action-2",
        "decision-3>stop-1:no",
      ]),
    );
  });

  it("draws fork and join as bars, converges end merge and split, and branches a switch", async () => {
    const ir = await pumlToIr(
      "@startuml\nstart\nfork\n  :a;\nfork again\n  :b;\nend fork\nfork\n  :c;\nfork again\n  :d;\nend merge\nsplit\n  :e;\nsplit again\n  :f;\nend split\nswitch (m?)\ncase (1)\n  :g;\ncase (2)\n  :h;\nendswitch\nstop\n@enduml\n",
    );
    expect(ir.nodes.filter((n) => n.kind === "bar").map((n) => n.classifier)).toEqual(["fork", "join", "fork"]);
    expect(flows(ir)).toEqual(
      expect.arrayContaining([
        "fork-1>action-1",
        "fork-1>action-2",
        "action-1>join-1",
        "action-2>join-1",
        "join-1>fork-2",
        "action-3>action-5",
        "action-4>action-5",
        "action-3>action-6",
        "action-4>action-6",
        "action-5>decision-1",
        "action-6>decision-1",
        "decision-1>action-7:1",
        "decision-1>action-8:2",
        "action-7>stop-1",
        "action-8>stop-1",
      ]),
    );
  });

  it("assigns lanes and partitions, attaches notes, labels arrows and stops the flow at kill", async () => {
    const ir = await pumlToIr(
      "@startuml Flow\n|Customer|\nstart\n:Browse;\n-> picked;\n|Shop|\npartition Billing {\n  :Charge;\n  note right: nightly\n}\n|Customer|\n:Receive;\nkill\n:Unreachable;\n@enduml\n",
    );
    expect(ir.title).toBe("Flow");
    const lanes = ir.nodes.filter((n) => n.classifier === "swimlane");
    expect(lanes.map((n) => n.label)).toEqual(["Customer", "Shop"]);
    const by = (id: string) => ir.nodes.find((n) => n.id === id)!;
    expect(by("action-1")).toMatchObject({ label: "Browse", parent: "lane-1" });
    expect(by("partition-1")).toMatchObject({ kind: "container", classifier: "partition", label: "Billing", parent: "lane-2" });
    expect(by("action-2")).toMatchObject({ label: "Charge", parent: "partition-1" });
    expect(by("note-1")).toMatchObject({ kind: "note", label: "nightly", parent: "partition-1" });
    expect(ir.edges).toContainEqual({ from: "note-1", to: "action-2", kind: "attachment" });
    expect(flows(ir)).toContain("action-1>action-2:picked");
    expect(by("action-3")).toMatchObject({ label: "Receive", parent: "lane-1" });
    expect(flows(ir).some((f) => f.endsWith(">action-4"))).toBe(false);
  });

  it("validates against the schema and leaves class diagrams alone", async () => {
    const ir = await pumlToIr(ISSUE);
    expect(validateIr(JSON.parse(JSON.stringify(ir))).notice).toBeUndefined();
    const cls = await pumlToIr("@startuml\nclass A\nclass B\nA --> B\n@enduml\n");
    expect(kinds(cls)).toEqual(["box", "box"]);
    const legacy = await pumlToIr('@startuml\nif "legacy" then\n  -->[true] "act"\nendif\n@enduml\n');
    expect(legacy.notice).toMatch(/^Legacy-syntax activity diagram/);
  });
});

describe("activity drawing", () => {
  it("draws the shapes with their classes and the solid flow arrowhead", async () => {
    const svg = await renderSvg(await pumlToIr(ISSUE));
    expect(svg).toContain('class="pr-start"');
    expect(svg).toContain('class="pr-action"');
    expect(svg).toContain('class="pr-decision"');
    expect(svg).toContain('class="pr-end pr-classifier-stop"');
    expect(svg).toContain('rx="10"');
    expect(svg).toContain("tri-solid");
    expect(svg).toContain(">valid?<");
  });

  it("is byte-deterministic for a flow with loops and lanes", async () => {
    const src =
      "@startuml\n|A|\nstart\nwhile (more?) is (yes)\n  :step;\nendwhile (no)\n|B|\nfork\n  :x;\nfork again\n  :y;\nend fork\nstop\n@enduml\n";
    const a = await renderSvg(await pumlToIr(src));
    const b = await renderSvg(await pumlToIr(src));
    expect(a).toBe(b);
  });
});

describe("swimlane layout", () => {
  const boxes = (svg: string) => {
    const out: { id: string; cls: string; x: number; y: number; w: number }[] = [];
    const re = /<g id="[^"]*" data-id="([^"]*)" class="([^"]*)"[^>]*>(?:<title>[^<]*<\/title>)?<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)"/g;
    for (const m of svg.matchAll(re)) out.push({ id: m[1], cls: m[2], x: Number(m[3]), y: Number(m[4]), w: Number(m[5]) });
    return out;
  };

  it("lays lanes out as disjoint columns in declaration order, nodes inside their lane, chains straight", async () => {
    const ir = await pumlToIr(
      "@startuml\n|A|\nstart\n:one;\n:two;\n|B|\n:three;\nif (ok?) then (yes)\n  :four;\nelse (no)\n  :five;\nendif\n|A|\n:six;\nstop\n@enduml\n",
    );
    const svg = await renderSvg(ir);
    const all = boxes(svg);
    const lanes = all.filter((b) => b.cls.includes("pr-classifier-swimlane")).sort((a, b) => a.x - b.x);
    expect(lanes.map((l) => l.id)).toEqual(["lane-1", "lane-2"]);
    expect(lanes[0].x + lanes[0].w).toBeLessThanOrEqual(lanes[1].x);
    const laneOf = new Map(ir.nodes.filter((n) => n.parent).map((n) => [n.id, n.parent!]));
    for (const b of all.filter((b) => b.cls === "pr-action")) {
      const lane = lanes.find((l) => l.id === laneOf.get(b.id))!;
      expect(b.x).toBeGreaterThanOrEqual(lane.x);
      expect(b.x + b.w).toBeLessThanOrEqual(lane.x + lane.w);
    }
    const one = all.find((b) => b.id === "action-1")!;
    const two = all.find((b) => b.id === "action-2")!;
    expect(one.x + one.w / 2).toBe(two.x + two.w / 2);
    expect(two.y).toBeGreaterThan(one.y);
    expect(svg).toContain('class="pr-edge pr-edge-flow"');
  });
});
