import { describe, expect, it } from "vitest";

import { renderSvg } from "../../src/render/engine.js";
import { pumlToIr } from "../../src/render/frontend.js";

const MACHINE = `@startuml maquina
[*] --> Idle
Idle --> Running : start
Running --> Idle : stop
state Running {
  [*] --> Warming
  Warming --> Hot : ready [temp>50] / abrir()
  Hot --> [*]
}
state "Mantenimiento programado" as Mant
Mant : requiere operador
Idle --> Mant [[{solo con la llave puesta}]]
@enduml
`;

const id = (s: string) => s.replace(/\u0000/g, "#");

describe("a state machine from PlantUML", () => {
  it("draws states, composites and the two terminals", async () => {
    const ir = await pumlToIr(MACHINE);
    const kinds = new Map(ir.nodes.map((n) => [id(n.id), n.kind]));
    expect(kinds.get("#start")).toBe("start");
    expect(kinds.get("Idle")).toBe("action");
    // A composite holds its own machine, terminals included.
    expect(kinds.get("Running")).toBe("container");
    expect(kinds.get("Running.#start")).toBe("start");
    expect(kinds.get("Running.Warming")).toBe("action");
    expect(kinds.get("Running.#end")).toBe("end");
  });

  it("declares a state by using it, and lets a later declaration say more", async () => {
    const ir = await pumlToIr(MACHINE);
    // `Running` is first named by a transition and only then declared.
    expect(ir.nodes.find((n) => n.id === "Running")!.kind).toBe("container");
    expect(ir.nodes.find((n) => n.id === "Idle")).toBeTruthy();
  });

  it("shows the long name and answers to the short one", async () => {
    const ir = await pumlToIr(MACHINE);
    const mant = ir.nodes.find((n) => n.id === "Mant")!;
    expect(mant.label).toBe("Mantenimiento programado");
    expect(mant.title).toBe("requiere operador");
    expect(ir.edges.some((e) => e.to === "Mant")).toBe(true);
  });

  it("carries the trigger, the guard and the action as written", async () => {
    const ir = await pumlToIr(MACHINE);
    const inner = ir.edges.find((e) => e.to === "Running.Hot")!;
    expect(inner.label).toBe("ready [temp>50] / abrir()");
  });

  it("takes an explanation off a transition", async () => {
    const ir = await pumlToIr(MACHINE);
    const edge = ir.edges.find((e) => e.to === "Mant")!;
    expect(edge.title).toBe("solo con la llave puesta");
    expect(edge.label).toBeUndefined();
  });

  it("shares one terminal per level, however many arrows reach it", async () => {
    const ir = await pumlToIr(`@startuml
[*] --> A
A --> [*]
B --> [*]
@enduml
`);
    expect(ir.nodes.filter((n) => n.kind === "end")).toHaveLength(1);
    expect(ir.nodes.filter((n) => n.kind === "start")).toHaveLength(1);
  });

  it("draws the whole thing, with nothing dangling", async () => {
    const svg = await renderSvg(await pumlToIr(MACHINE));
    const ir = await pumlToIr(MACHINE);
    expect([...svg.matchAll(/data-from=/g)]).toHaveLength(ir.edges.length);
  });
});

describe("what a state diagram does not draw yet", () => {
  it("says which shapes it drew as plain states", async () => {
    const ir = await pumlToIr(`@startuml
state Choice <<choice>>
[*] --> Choice
Choice --> [H]
@enduml
`);
    expect(ir.notice).toContain("history");
    expect(ir.notice).toContain("pseudostate shapes");
  });

  it("names concurrent regions rather than dropping them in silence", async () => {
    const ir = await pumlToIr(`@startuml
state R {
  [*] --> L
  --
  [*] --> D
}
@enduml
`);
    expect(ir.notice).toContain("concurrent regions");
  });

  it("says nothing when there is nothing to say", async () => {
    expect((await pumlToIr(MACHINE)).notice).toBeUndefined();
  });
});
