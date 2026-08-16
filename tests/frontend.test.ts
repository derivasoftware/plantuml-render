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
