// @covers render.frontend.configureParser, render.frontend.load, render.frontend.packagedAssets
// @covers render.frontend.pumlToIr, render.frontend.syntaxErrorLine
import { afterEach, describe, expect, it } from "vitest";

import {
  configureParser,
  load,
  packagedAssets,
  pumlToIr,
  syntaxErrorLine,
} from "../../src/render/frontend.js";

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

describe("pumlToIr", () => {
  it("maps a whole class diagram through the parser", async () => {
    const ir = await pumlToIr(PUML);
    expect(ir.ir).toBe(1);
    expect(ir.title).toBe("demo");
    expect(ir.nodes.map((n) => [n.id, n.kind, n.parent])).toEqual([
      ["core", "container", undefined],
      ["core.Base", "box", "core"],
      ["core.Impl", "box", "core"],
      ["NN", "box", undefined],
      ["note-1", "note", undefined],
    ]);
    expect(ir.nodes[1]).toMatchObject({
      abstract: true,
      sections: [["+ id : str"], ["+ load() : None"]],
      sectionKinds: ["attributes", "methods"],
    });
    expect(ir.edges).toEqual([
      { from: "core.Impl", to: "core.Base", kind: "inheritance" },
      { from: "NN", to: "core.helper", kind: "dependency" },
      { from: "note-1", to: "NN", kind: "attachment" },
    ]);
  });

  it("yields an empty drawing for an empty source", async () => {
    expect(await pumlToIr("")).toEqual({ ir: 1, nodes: [], edges: [] });
  });

  it("stays lossless on a source that does not parse whole", async () => {
    const ir = await pumlToIr("@startuml\nclass A {\n + x\n}\n\nclass B {\n\n@enduml\n");
    expect(ir.nodes.map((n) => n.id)).toEqual(["A"]);
  });

  it("carries a notice for a kind it does not draw", async () => {
    const ir = await pumlToIr("@startmindmap\n* a\n@endmindmap\n");
    expect(ir.nodes).toEqual([]);
    expect(ir.notice).toBe("Mindmap diagram: not drawn by plantuml-render (kept lossless).");
  });

  it("gives the same result on repeated calls over the cached parser", async () => {
    const source = "@startuml\nclass A\n@enduml\n";
    expect(await pumlToIr(source)).toEqual(await pumlToIr(source));
  });
});

describe("syntaxErrorLine", () => {
  it("is null for a source that parses whole", async () => {
    expect(await syntaxErrorLine(PUML)).toBeNull();
  });

  it("is null for an empty source", async () => {
    expect(await syntaxErrorLine("")).toBeNull();
  });

  it("is null for raw lines, which the grammar keeps without error", async () => {
    expect(await syntaxErrorLine("@startuml\nclass A\n}}}\n@enduml\n")).toBeNull();
  });

  it("gives the 1-based line of an ERROR node", async () => {
    expect(await syntaxErrorLine("@startuml\nA --> : hi\n@enduml\n")).toBe(2);
    expect(await syntaxErrorLine("@startuml\nclass A {\n + x\n}\n\nclass B {\n\n@enduml\n")).toBe(6);
  });

  it("gives the first of several errors", async () => {
    const source = '@startuml\nclass "b\n\n\nclass C {\n\n@enduml\n';
    expect(await syntaxErrorLine(source)).toBe(2);
    expect(
      await syntaxErrorLine('@startuml\nclass A {\n + x\n}\nclass "b\nclass C\nclass "d\n@enduml\n'),
    ).toBe(5);
  });

  it("gives the line of a missing node", async () => {
    expect(await syntaxErrorLine("@startuml\nA --> \n@enduml\n")).toBe(2);
    expect(await syntaxErrorLine("@startuml\nclass A\n")).toBe(3);
  });

  it("flags a start tag outside the grammar on its first line", async () => {
    expect(await syntaxErrorLine("@startmindmap\n* a\n@endmindmap\n")).toBe(1);
  });
});

describe("packagedAssets", () => {
  const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d];

  it("reads both wasm modules from the package tree", async () => {
    const { grammar, runtime } = await packagedAssets();
    expect(grammar).toBeInstanceOf(Uint8Array);
    expect(runtime).toBeInstanceOf(Uint8Array);
    expect([...grammar.slice(0, 4)]).toEqual(WASM_MAGIC);
    expect([...runtime.slice(0, 4)]).toEqual(WASM_MAGIC);
  });

  it("returns the grammar and the runtime as distinct modules", async () => {
    const { grammar, runtime } = await packagedAssets();
    expect(grammar.length).not.toBe(runtime.length);
  });

  it("hands out a fresh copy on each call", async () => {
    const first = await packagedAssets();
    const second = await packagedAssets();
    expect(second.grammar.length).toBe(first.grammar.length);
    first.grammar[0] = 0xff;
    expect(second.grammar[0]).toBe(0x00);
  });
});

describe("load", () => {
  it("returns a parser ready for the plantuml grammar", async () => {
    const parser = await load();
    const tree = parser.parse("@startuml\nclass A\n@enduml\n");
    expect(tree?.rootNode.type).toBe("source_file");
    expect(tree?.rootNode.hasError).toBe(false);
    expect(tree?.rootNode.namedChildren[0]?.type).toBe("diagram");
  });

  it("builds a new parser on each call", async () => {
    expect(await load()).not.toBe(await load());
  });
});

describe("configureParser", () => {
  const SOURCE = "@startuml\nclass A\n@enduml\n";
  const NOT_WASM = new Uint8Array([1, 2, 3, 4]);

  // The module keeps the configured assets: every case leaves real ones behind.
  afterEach(async () => {
    configureParser(await packagedAssets());
  });

  it("drops the cached parser, so the next parse uses the new assets", async () => {
    const real = await packagedAssets();
    expect((await pumlToIr(SOURCE)).nodes).toHaveLength(1);
    configureParser({ grammar: NOT_WASM, runtime: real.runtime });
    await expect(pumlToIr(SOURCE)).rejects.toThrow("wasm magic number");
    await expect(syntaxErrorLine(SOURCE)).rejects.toThrow("wasm magic number");
  });

  it("makes load read the configured assets", async () => {
    const real = await packagedAssets();
    configureParser({ grammar: NOT_WASM, runtime: real.runtime });
    await expect(load()).rejects.toThrow("wasm magic number");
  });

  it("recovers from a failed load when given working assets", async () => {
    const real = await packagedAssets();
    configureParser({ grammar: NOT_WASM, runtime: real.runtime });
    await expect(pumlToIr(SOURCE)).rejects.toThrow();
    configureParser(real);
    expect((await pumlToIr(SOURCE)).nodes.map((n) => n.id)).toEqual(["A"]);
    expect(await syntaxErrorLine(SOURCE)).toBeNull();
  });

  it("parses with assets already in memory", async () => {
    const { grammar, runtime } = await packagedAssets();
    configureParser({ grammar: grammar.slice(), runtime: runtime.slice() });
    const parser = await load();
    expect(parser.parse(SOURCE)?.rootNode.hasError).toBe(false);
    expect((await pumlToIr(SOURCE)).nodes.map((n) => n.id)).toEqual(["A"]);
  });
});
