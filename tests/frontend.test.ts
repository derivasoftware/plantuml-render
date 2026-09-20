import { describe, expect, it } from "vitest";

import { pumlToIr } from "../src/render/frontend.js";

const PUML = `@startuml demo
namespace core {
  abstract class Base {
    + id : str
    + load() : None
  }
  class Impl
  Impl --|> Base
}
class "Nice Name" as NN
NN ..> core.helper
note left of NN : remember this
@enduml
`;

describe("puml frontend", () => {
  it("projects the class subset into render-IR", async () => {
    const ir = await pumlToIr(PUML);
    expect(ir.title).toBe("demo");
    const byId = new Map(ir.nodes.map((n) => [n.id, n]));
    expect(byId.get("core")?.kind).toBe("container");
    expect(byId.get("core.Base")?.abstract).toBe(true);
    expect(byId.get("core.Base")?.sections).toEqual([
      ["+ id : str"],
      ["+ load() : None"],
    ]);
    expect(byId.get("NN")?.label).toBe("NN");
  });

  it("requalifies relation endpoints and maps kinds", async () => {
    const ir = await pumlToIr(PUML);
    expect(ir.edges).toContainEqual({
      from: "core.Impl",
      to: "core.Base",
      kind: "inheritance",
      label: undefined,
    });
    expect(
      ir.edges.some((e) => e.from === "NN" && e.kind === "dependency"),
    ).toBe(true);
  });

  it("emits notes with attachments", async () => {
    const ir = await pumlToIr(PUML);
    const note = ir.nodes.find((n) => n.kind === "note");
    expect(note?.label).toBe("remember this");
    expect(
      ir.edges.some((e) => e.from === note?.id && e.kind === "attachment"),
    ).toBe(true);
  });

  it("frontend output always validates against the schema", async () => {
    const { validateIr } = await import("../src/render/ir.js");
    const ir = structuredClone(await pumlToIr(PUML));
    expect(() => validateIr(ir)).not.toThrow();
  });
});

describe("reversed and decorated operators", () => {
  it("swaps reversed arrows into canonical edges", async () => {
    const ir = await pumlToIr(
      "@startuml\nRunInfo <|-- ContextEntity\nA <.. B\nOwner --* Part\n@enduml\n",
    );
    expect(ir.edges).toContainEqual({
      from: "ContextEntity", to: "RunInfo", kind: "inheritance", label: undefined,
    });
    expect(ir.edges).toContainEqual({
      from: "B", to: "A", kind: "dependency", label: undefined,
    });
    expect(ir.edges).toContainEqual({
      from: "Part", to: "Owner", kind: "composition", label: undefined,
    });
  });

  it("maps direction-decorated and plain operators", async () => {
    const ir = await pumlToIr("@startuml\nA -left-> B\nC -- D\n@enduml\n");
    expect(ir.edges).toContainEqual({
      from: "A", to: "B", kind: "association", label: undefined,
    });
    expect(ir.edges).toContainEqual({
      from: "C", to: "D", kind: "association", label: undefined,
    });
  });
});

describe("diagram kinds that are not drawn", () => {
  const STATE = "@startuml demo\n[*] --> Init\nInit --> Nom : ready\nNom --> [*]\n@enduml\n";
  const ACTIVITY = "@startuml demo2\nstart\n:Read input;\nif (valid?) then (yes)\n  :Process;\nelse (no)\n  :Reject;\nendif\nstop\n@enduml\n";

  it("returns an empty IR with a notice naming the kind", async () => {
    const state = await pumlToIr(STATE);
    expect(state.nodes).toEqual([]);
    expect(state.edges).toEqual([]);
    expect(state.title).toBe("demo");
    expect(state.notice).toMatch(/^State diagram: not drawn by plantuml-render/);
    const activity = await pumlToIr(ACTIVITY);
    expect(activity.notice).toMatch(/^Activity diagram/);
    expect(activity.title).toBe("demo2");
  });

  it("recognises use case, component sources and non-UML start tags", async () => {
    expect((await pumlToIr("@startuml\nactor User\nusecase (Login) as UC1\nUser --> UC1\n@enduml\n")).notice).toMatch(/^Use case diagram/);
    expect((await pumlToIr("@startuml\ncomponent [Web] as W\ndatabase DB\nW --> DB\n@enduml\n")).notice).toMatch(/^Component diagram/);
    expect((await pumlToIr("@startmindmap\n* root\n** child\n@endmindmap\n")).notice).toMatch(/^Mindmap diagram/);
  });

  it("says so when relations only reference undeclared entities", async () => {
    const ir = await pumlToIr("@startuml\nA --> B\nB ..> C\n@enduml\n");
    expect(ir.nodes).toEqual([]);
    expect(ir.edges).toHaveLength(2);
    expect(ir.notice).toBe("Nothing drawn: 2 relations reference entities that are not declared in this diagram.");
  });

  it("leaves class and sequence diagrams without a notice", async () => {
    expect((await pumlToIr(PUML)).notice).toBeUndefined();
    const seq = await pumlToIr("@startuml\nparticipant A\nA -> B : go\nalt ok\n  B --> A : done\nend\n@enduml\n");
    expect(seq.notice).toBeUndefined();
    expect(seq.nodes.some((n) => n.kind === "lifeline")).toBe(true);
    const noted = await pumlToIr("@startuml\nclass X\nnote right of X\n  start here, stop there\nend note\n@enduml\n");
    expect(noted.notice).toBeUndefined();
  });

  it("notices validate against the schema", async () => {
    const { validateIr } = await import("../src/render/ir.js");
    expect(() => validateIr(JSON.parse(JSON.stringify(pumlToIr(STATE))))).not.toThrow;
    expect(validateIr(JSON.parse(JSON.stringify(await pumlToIr(STATE)))).notice).toContain("State diagram");
  });
});

describe("hyperlinks on entity heads", () => {
  it("maps [[url]] and [[url{tooltip}]] on class, interface and aliased heads to href and title", async () => {
    const ir = await pumlToIr(
      '@startuml\nclass Order [[https://docs/order.html{Order aggregate}]] {\n  +total()\n}\ninterface Payable [[#payable]]\nclass "Nice" as NN [[http://n]]\nenum Kind\n@enduml\n',
    );
    const by = (id: string) => ir.nodes.find((n) => n.id === id)!;
    expect(by("Order")).toMatchObject({ href: "https://docs/order.html", title: "Order aggregate" });
    expect(by("Order").sections).toEqual([["+total()"]]);
    expect(by("Payable")).toMatchObject({ href: "#payable" });
    expect(by("Payable").title).toBeUndefined();
    expect(by("NN")).toMatchObject({ href: "http://n" });
    expect(by("Kind").href).toBeUndefined();
  });
});
