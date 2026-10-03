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
