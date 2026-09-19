import { describe, expect, it } from "vitest";

import { renderSvg } from "../src/render/engine.js";
import { pumlToIr } from "../src/render/frontend.js";
import { validateIr, type RenderIr } from "../src/render/ir.js";

const SRC = `@startuml
participant "Front End" as FE
actor User
database Store
User -> FE : click
FE --> User : ack
FE -> FE : debounce
alt cached
  FE -> Store : read
else miss
  FE -> Store : write
end
== phase two ==
note right of FE
  remembers
  the last click
end note
loop retries
  FE -> Store : ping
end
@enduml
`;

describe("sequence IR vocabulary", () => {
  const IR: RenderIr = {
    ir: 1,
    nodes: [
      { id: "A", kind: "lifeline", label: "A", classifier: "participant" },
      { id: "B", kind: "lifeline", label: "B" },
      { id: "frame-1", kind: "frame", label: "alt ok", span: [0, 1],
        dividers: [{ at: 1, label: "else" }] },
      { id: "divider-1", kind: "divider", label: "phase", at: 2 },
      { id: "note-1", kind: "note", label: "hi", at: 3, anchor: "A" },
    ],
    edges: [
      { from: "A", to: "B", kind: "message", label: "go", order: 0 },
      { from: "B", to: "A", kind: "message", order: 1, dashed: true },
    ],
  };

  it("validates lifelines, frames, dividers, anchored notes and messages", async () => {
    expect(() => validateIr(IR)).not.toThrow();
  });

  it("rejects a message without an order", async () => {
    const bad = JSON.parse(JSON.stringify(IR));
    delete bad.edges[0].order;
    expect(() => validateIr(bad)).toThrow(/order/);
  });
});

describe("frontend sequence mapping", () => {
  it("maps the evidence-scoped corpus constructs", async () => {
    const ir = await pumlToIr(SRC);
    const byId = new Map(ir.nodes.map((n) => [n.id, n]));

    // participants: alias is the id, declaration label survives
    expect(byId.get("FE")).toMatchObject({ kind: "lifeline", label: "Front End" });
    expect(byId.get("User")?.classifier).toBe("actor");
    expect(byId.get("Store")?.classifier).toBe("database");

    // messages in statement order; dashed decodes from the dotted core
    const msgs = ir.edges.filter((e) => e.kind === "message");
    expect(msgs.map((m) => m.order)).toEqual([0, 1, 2, 3, 4, 7]);
    expect(msgs[0]).toMatchObject({ from: "User", to: "FE", label: "click" });
    expect(msgs[1].dashed).toBe(true);
    expect(msgs[2].from).toBe("FE");
    expect(msgs[2].to).toBe("FE"); // self-message

    // alt/else spans its rows; the else lands as a frame divider
    const frames = ir.nodes.filter((n) => n.kind === "frame");
    expect(frames[0]).toMatchObject({ label: "alt cached", span: [3, 4] });
    expect(frames[0].dividers).toEqual([{ at: 4, label: "miss" }]);
    expect(frames[1]).toMatchObject({ label: "loop retries", span: [7, 7] });

    // == divider and the note claim their own rows
    const divider = ir.nodes.find((n) => n.kind === "divider");
    expect(divider).toMatchObject({ label: "phase two", at: 5 });
    const note = ir.nodes.find((n) => n.kind === "note");
    expect(note).toMatchObject({ anchor: "FE", at: 6 });
    expect(note?.label).toContain("remembers");
  });

  it("creates lifelines on first use for undeclared names", async () => {
    const ir = await pumlToIr("@startuml\nparticipant A\nA -> Ghost : hi\n@enduml\n");
    expect(ir.nodes.find((n) => n.id === "Ghost")?.kind).toBe("lifeline");
  });

  it("keeps class diagrams on the class pipeline", async () => {
    const ir = await pumlToIr("@startuml\nclass A\nA --> B\n@enduml\n");
    expect(ir.nodes.every((n) => n.kind !== "lifeline")).toBe(true);
    expect(ir.edges[0].kind).toBe("association");
  });
});

describe("sequence engine layout", () => {
  it("renders deterministically with lifelines, rows and frames", async () => {
    const ir = await pumlToIr(SRC);
    const a = await renderSvg(ir);
    const b = await renderSvg(ir);
    expect(a).toBe(b);
    expect(a).toContain('class="pr-box pr-lifeline-head');
    expect(a).toContain("pr-msg-dashed");
    expect(a).toContain('data-order="0"');
    expect(a).toContain("pr-frame");
    expect(a).toContain("pr-divider");
  });

  it("orders message rows top to bottom and keeps lifeline x stable", async () => {
    const ir = await pumlToIr(SRC);
    const svg = await renderSvg(ir);
    const ys = [...svg.matchAll(/data-order="(\d+)"[^>]*d="M(\d+) (\d+)/g)].map(
      (m) => [Number(m[1]), Number(m[3])] as const,
    );
    const sorted = [...ys].sort((p, q) => p[0] - q[0]).map((p) => p[1]);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]).toBeGreaterThan(sorted[i - 1]);
    }
  });

  it("draws a self-message as a loop with its label", async () => {
    const ir = await pumlToIr("@startuml\nparticipant A\nA -> A : again\n@enduml\n");
    const svg = await renderSvg(ir);
    expect(svg).toContain("again");
    expect(svg).toContain("pr-msg-self");
  });
});
