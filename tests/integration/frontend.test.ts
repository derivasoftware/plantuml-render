import { describe, expect, it } from "vitest";

import { pumlToIr } from "../../src/render/frontend.js";

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
    const { validateIr } = await import("../../src/render/ir.js");
    const ir = structuredClone(await pumlToIr(PUML));
    expect(() => validateIr(ir)).not.toThrow();
  });
});

describe("diagram kinds that are not drawn", () => {
  const STATE = "@startuml demo\n[*] --> Init\nInit --> Nom : ready\nNom --> [*]\n@enduml\n";
  const DEPLOY = "@startuml demo\nnode Server\nnode Client\nClient --> Server\n@enduml\n";
  const ACTIVITY = "@startuml demo2\nstart\n:Read input;\nif (valid?) then (yes)\n  :Process;\nelse (no)\n  :Reject;\nendif\nstop\n@enduml\n";

  it("returns an empty IR with a notice naming the kind", async () => {
    const deploy = await pumlToIr(DEPLOY);
    expect(deploy.nodes).toEqual([]);
    expect(deploy.edges).toEqual([]);
    expect(deploy.title).toBe("demo");
    expect(deploy.notice).toMatch(/^Deployment diagram: not drawn by plantuml-render/);
    const activity = await pumlToIr(ACTIVITY);
    expect(activity.notice).toBeUndefined();
    expect(activity.title).toBe("demo2");
    expect(activity.nodes.map((n) => n.kind)).toEqual(["start", "action", "decision", "action", "action", "end"]);
    expect(activity.edges.filter((e) => e.kind === "flow").map((e) => e.label ?? "")).toEqual(["", "", "yes", "no", "", ""]);
  });

  it("draws a state diagram now, instead of refusing it", async () => {
    const state = await pumlToIr(STATE);
    expect(state.notice).toBeUndefined();
    expect(state.nodes.map((n) => n.kind)).toEqual(["start", "action", "action", "end"]);
    expect(state.edges.map((e) => e.label ?? "")).toEqual(["", "ready", ""]);
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
    const { validateIr } = await import("../../src/render/ir.js");
    expect(() => validateIr(JSON.parse(JSON.stringify(pumlToIr(DEPLOY))))).not.toThrow;
    expect(validateIr(JSON.parse(JSON.stringify(await pumlToIr(DEPLOY)))).notice).toContain("Deployment diagram");
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

describe("references to an entity inside a container", () => {
  const NESTED = `@startuml
package Top <<block>> {
  class p1 <<in>>
  namespace o.i {
    class A
  }
  namespace o {
    class B
  }
  p1 --> o.i.A
  p1 --> B
  i.A --> o.B
}
@enduml
`;

  it("resolves a qualified tail to the entity that ends with it", async () => {
    const ir = await pumlToIr(NESTED);
    expect(ir.nodes.map((n) => n.id)).toContain("Top.o.i.A");
    const wires = ir.edges.map((e) => `${e.from}->${e.to}`);
    // The whole tail, the bare leaf and a middle slice all land on the entity.
    expect(wires).toContain("Top.p1->Top.o.i.A");
    expect(wires).toContain("Top.p1->Top.o.B");
    expect(wires).toContain("Top.o.i.A->Top.o.B");
  });

  it("leaves an ambiguous tail unresolved rather than guessing", async () => {
    const ir = await pumlToIr(`@startuml
namespace one.o {
  class A
}
namespace two.o {
  class A
}
class Caller
Caller --> o.A
@enduml
`);
    // Two entities end with `o.A`; wiring to either one would be a guess, so
    // the reference stays as written and the engine reports it undrawable.
    expect(ir.edges.find((e) => e.from === "Caller")!.to).toBe("o.A");
  });

  it("keeps the declared name ahead of any tail", async () => {
    const ir = await pumlToIr(`@startuml
namespace deep {
  class Sink
}
class Sink
class Caller
Caller --> Sink
@enduml
`);
    // `Sink` is declared at the top level, so that is what it names, even
    // though `deep.Sink` also ends with it.
    expect(ir.edges.find((e) => e.from === "Caller")!.to).toBe("Sink");
  });

  it("resolves the owner of a port reference the same way", async () => {
    const ir = await pumlToIr(`@startuml
namespace o {
  class Blk <<block>> {
    + out y
  }
}
class Sink
o.Blk::y --> Sink
@enduml
`);
    expect(ir.edges[0]).toMatchObject({ from: "o.Blk.y", to: "Sink" });
    expect(ir.nodes.some((n) => n.id === "o.Blk.y" && n.kind === "port")).toBe(true);
  });
});

describe("explanations", () => {
  const ir = (body: string) => pumlToIr(`@startuml\nclass A\nclass B\n${body}\n@enduml\n`);

  it("takes an explanation on an entity without asking for a link", async () => {
    const node = (await ir("class Order [[{El agregado de pedido}]]")).nodes.find((n) => n.id === "Order")!;
    expect(node.title).toBe("El agregado de pedido");
    expect(node.href).toBeUndefined();
  });

  it("still reads a link, with or without the explanation", async () => {
    const both = (await ir("class Order [[http://d/o{El agregado}]]")).nodes.find((n) => n.id === "Order")!;
    expect(both).toMatchObject({ href: "http://d/o", title: "El agregado" });
    const bare = (await ir("class Order [[http://d/o]]")).nodes.find((n) => n.id === "Order")!;
    expect(bare.href).toBe("http://d/o");
    expect(bare.title).toBeUndefined();
    const empty = (await ir("class Order [[]]")).nodes.find((n) => n.id === "Order")!;
    expect(empty.href).toBeUndefined();
  });

  it("takes the link off a relation's label instead of printing it", async () => {
    const [edge] = (await ir("A --> B : usa [[http://x{por qué usa}]]")).edges;
    expect(edge).toMatchObject({ label: "usa", href: "http://x", title: "por qué usa" });
  });

  it("leaves a relation that carries only an explanation without a label", async () => {
    const [edge] = (await ir("A --> B : [[{por qué}]]")).edges;
    expect(edge.title).toBe("por qué");
    expect(edge.label).toBeUndefined();
  });

  it("does not touch a label that has no link in it", async () => {
    const [edge] = (await ir("A --> B : usa [1..*]")).edges;
    expect(edge.label).toBe("usa [1..*]");
    expect(edge.title).toBeUndefined();
  });
});
