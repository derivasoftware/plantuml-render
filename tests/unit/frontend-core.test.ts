// @covers render.frontend-core.decodeOperator, render.frontend-core.diagramTitle, render.frontend-core.hyperlink
// @covers render.frontend-core.isSequence, render.frontend-core.memberSections, render.frontend-core.notDrawnKind
// @covers render.frontend-core.notDrawnNotice, render.frontend-core.portDirection, render.frontend-core.sequenceToIr
// @covers render.frontend-core.splitPorts, render.frontend-core.treeToIr
import { beforeAll, describe, expect, it } from "vitest";

import { load } from "../../src/render/frontend.js";
import {
  type CstNode,
  decodeOperator,
  diagramTitle,
  hyperlink,
  isSequence,
  memberSections,
  notDrawnKind,
  notDrawnNotice,
  portDirection,
  sequenceToIr,
  splitPorts,
  treeToIr,
} from "../../src/render/frontend-core.js";

type LoadedParser = Awaited<ReturnType<typeof load>>;

let parser: LoadedParser;

beforeAll(async () => {
  parser = await load();
});

/** The real tree the grammar gives for a source. */
function parse(source: string): CstNode {
  const tree = parser.parse(source);
  if (!tree) throw new Error("the parser returned no tree");
  return tree.rootNode as unknown as CstNode;
}

/** The first node of a type in a tree, depth first. */
function find(root: CstNode, type: string): CstNode {
  const walk = (node: CstNode): CstNode | undefined => {
    if (node.type === type) return node;
    for (const child of node.namedChildren) {
      const hit = walk(child);
      if (hit) return hit;
    }
    return undefined;
  };
  const hit = walk(root);
  if (!hit) throw new Error(`no ${type} node in the tree`);
  return hit;
}

/** A hand-built node, for the shapes the grammar does not produce on demand. */
function stub(
  type: string,
  named: CstNode[] = [],
  options: { text?: string; fields?: Record<string, CstNode> } = {},
): CstNode {
  return {
    type,
    text: options.text ?? "",
    children: named,
    namedChildren: named,
    childForFieldName: (name) => options.fields?.[name] ?? null,
  };
}

const classDecl = (source: string): CstNode =>
  find(parse(`@startuml\n${source}\n@enduml\n`), "class_declaration");

describe("decodeOperator", () => {
  it.each([
    ["--|>", "inheritance", false],
    ["<|--", "inheritance", true],
    ["..|>", "realization", false],
    ["<|..", "realization", true],
    ["*--", "composition", false],
    ["--*", "composition", true],
    ["o--", "aggregation", false],
    ["--o", "aggregation", true],
    ["-->", "association", false],
    ["<--", "association", true],
    ["..>", "dependency", false],
    ["<..", "dependency", true],
    ["--", "association", false],
    ["..", "association", false],
    ["-", "association", false],
  ])("decodes %s as %s (swapped: %s)", (op, kind, swapped) => {
    expect(decodeOperator(op)).toEqual({ kind, swapped });
  });

  it.each([
    ["-left->", "association", false],
    ["-right-|>", "inheritance", false],
    [".up.>", "dependency", false],
    ["<-down-", "association", true],
    ["<|.left.", "realization", true],
  ])("strips the direction hint from %s", (op, kind, swapped) => {
    expect(decodeOperator(op)).toEqual({ kind, swapped });
  });

  it.each(["", "=>", "abc", "-diagonal->", "><"])("rejects %j", (op) => {
    expect(decodeOperator(op)).toBeNull();
  });
});

describe("isSequence", () => {
  it("recognises a participant declaration", () => {
    expect(isSequence(parse("@startuml\nparticipant A\n@enduml\n"))).toBe(true);
  });

  it("recognises a frame", () => {
    expect(isSequence(parse("@startuml\nalt ok\nA -> B\nend\n@enduml\n"))).toBe(true);
  });

  it("does not take bare messages or classes for a sequence", () => {
    expect(isSequence(parse("@startuml\nA -> B\n@enduml\n"))).toBe(false);
    expect(isSequence(parse("@startuml\nclass A {\n + x\n}\n@enduml\n"))).toBe(false);
  });

  it("finds a declaration nested below the root", () => {
    const nested = stub("source_file", [stub("diagram", [stub("participant_declaration")])]);
    expect(isSequence(nested)).toBe(true);
  });

  it("does not look inside an entity body", () => {
    const body = stub("entity_body", [stub("participant_declaration"), stub("frame_block")]);
    expect(isSequence(stub("source_file", [body]))).toBe(false);
  });
});

describe("sequenceToIr", () => {
  it("takes the title from the diagram name and defaults undeclared lifelines", () => {
    const ir = sequenceToIr(parse("@startuml seq\nA -> B : hi\n@enduml\n"));
    expect(ir.ir).toBe(1);
    expect(ir.title).toBe("seq");
    expect(ir.nodes).toEqual([
      { id: "A", kind: "lifeline", label: "A", classifier: "participant" },
      { id: "B", kind: "lifeline", label: "B", classifier: "participant" },
    ]);
    expect(ir.edges).toEqual([{ from: "A", to: "B", kind: "message", label: "hi", order: 0 }]);
  });

  it("declares a lifeline once, with its kind, under its alias", () => {
    const ir = sequenceToIr(
      parse('@startuml\nparticipant "Al" as A\nparticipant "Al" as A\ndatabase D\n@enduml\n'),
    );
    expect(ir.nodes).toEqual([
      { id: "A", kind: "lifeline", label: "Al", classifier: "participant" },
      { id: "D", kind: "lifeline", label: "D", classifier: "database" },
    ]);
  });

  it("routes a message written with the declared name to the aliased lifeline", () => {
    const ir = sequenceToIr(
      parse('@startuml\nparticipant "Al" as A\nparticipant B\n"Al" -> B\n@enduml\n'),
    );
    expect(ir.nodes.map((n) => n.id)).toEqual(["A", "B"]);
    expect(ir.edges[0]).toMatchObject({ from: "A", to: "B" });
  });

  it("reverses arrows pointing left and marks dashed ones", () => {
    const ir = sequenceToIr(
      parse("@startuml\nA <- B\nA <-- B\nA --> B\nA ..> B\nA -> B\n@enduml\n"),
    );
    expect(ir.edges.map((e) => [e.from, e.to, e.dashed, e.order])).toEqual([
      ["B", "A", undefined, 0],
      ["B", "A", true, 1],
      ["A", "B", true, 2],
      ["A", "B", true, 3],
      ["A", "B", undefined, 4],
    ]);
  });

  it("ignores a colour bracket when reading the arrow's style", () => {
    const ir = sequenceToIr(parse("@startuml\nA -[#red]> B\n@enduml\n"));
    expect(ir.edges).toEqual([{ from: "A", to: "B", kind: "message", order: 0 }]);
  });

  it("gives a divider its own row and a clean label", () => {
    const ir = sequenceToIr(parse("@startuml\nA -> B\n== mid ==\nA -> B\n@enduml\n"));
    expect(ir.nodes).toContainEqual({ id: "divider-1", kind: "divider", label: "mid", at: 1 });
    expect(ir.edges.map((e) => e.order)).toEqual([0, 2]);
  });

  it("spans a frame over its children and divides it at each else", () => {
    const ir = sequenceToIr(
      parse("@startuml\nA -> B\nalt good\nA -> B\nelse bad\nA -> B\nend\nA -> B\n@enduml\n"),
    );
    expect(ir.nodes).toContainEqual({
      id: "frame-1",
      kind: "frame",
      label: "alt good",
      span: [1, 2],
      dividers: [{ at: 2, label: "bad" }],
    });
    expect(ir.edges.map((e) => e.order)).toEqual([0, 1, 2, 3]);
  });

  it("labels an unlabelled else and an unlabelled frame by keyword", () => {
    const ir = sequenceToIr(
      parse("@startuml\ngroup\nA -> B\nend\nalt c\nA -> B\nelse\nA -> B\nend\n@enduml\n"),
    );
    expect(ir.nodes.find((n) => n.id === "frame-1")?.label).toBe("group");
    expect(ir.nodes.find((n) => n.id === "frame-2")?.dividers).toEqual([{ at: 2, label: "else" }]);
  });

  it("keeps an empty frame on a row of its own", () => {
    const ir = sequenceToIr(parse("@startuml\nopt empty\nend\nA -> B\n@enduml\n"));
    expect(ir.nodes).toContainEqual({
      id: "frame-1",
      kind: "frame",
      label: "opt empty",
      span: [0, 0],
    });
    expect(ir.edges[0].order).toBe(1);
  });

  it("anchors a note to the first target and to a lifeline it may create", () => {
    const ir = sequenceToIr(
      parse("@startuml\nparticipant A\nparticipant D\nnote over A, D : across\nnote left of Ghost : boo\n@enduml\n"),
    );
    expect(ir.nodes).toContainEqual({
      id: "note-1", kind: "note", label: "across", classifier: "over", anchor: "A", at: 0,
    });
    expect(ir.nodes).toContainEqual({
      id: "Ghost", kind: "lifeline", label: "Ghost", classifier: "participant",
    });
    expect(ir.nodes).toContainEqual({
      id: "note-2", kind: "note", label: "boo", classifier: "left", anchor: "Ghost", at: 1,
    });
  });

  it("joins a multi-line note body and leaves an unanchored note free", () => {
    const ir = sequenceToIr(
      parse("@startuml\nparticipant A\nnote left of A\nl1\nl2\nend note\nnote right : bare\n@enduml\n"),
    );
    expect(ir.nodes.find((n) => n.id === "note-1")).toMatchObject({ label: "l1\nl2", at: 0 });
    const bare = ir.nodes.find((n) => n.id === "note-2");
    expect(bare).toMatchObject({ label: "bare", classifier: "right", at: 1 });
    expect(bare?.anchor).toBeUndefined();
  });

  it("falls back to a placeholder note on the right when nothing is written", () => {
    const ir = sequenceToIr(stub("source_file", [stub("note_statement")]));
    expect(ir.nodes).toEqual([
      { id: "note-1", kind: "note", label: "note", classifier: "right", anchor: undefined, at: 0 },
    ]);
  });
});

describe("notDrawnKind", () => {
  it.each([
    ["mindmap", "mindmap"],
    ["gantt", "gantt"],
    ["wbs", "work breakdown"],
    ["json", "JSON"],
    ["yaml", "YAML"],
    ["salt", "salt wireframe"],
    ["ditaa", "ditaa"],
    ["dot", "dot"],
    ["chronology", "chronology"],
    ["regex", "regex"],
  ])("names the @start%s tag", (tag, kind) => {
    expect(notDrawnKind(stub("source_file", [], { text: `@start${tag}\n` }))).toBe(kind);
  });

  it("repeats a start tag it does not know", () => {
    expect(notDrawnKind(parse("@startfoo\nx\n@endfoo\n"))).toBe("foo");
  });

  it.each([
    ["start", "legacy-syntax activity"],
    ["end fork", "legacy-syntax activity"],
    ["endfork", "legacy-syntax activity"],
    ["if (x) then", "legacy-syntax activity"],
    ["-->[ok] act", "legacy-syntax activity"],
    ["[*] --> S", "state"],
    ["state S", "state"],
    ["usecase U", "use case"],
    ["component C", "component"],
    ["artifact A", "component"],
    ["node N", "deployment"],
    ["cloud C", "deployment"],
    ["storage S", "deployment"],
    ["hexagon H", "deployment"],
  ])("reads the raw line %j as %s", (line, kind) => {
    expect(notDrawnKind(stub("source_file", [stub("raw_line", [], { text: `  ${line}  ` })]))).toBe(kind);
  });

  it("reads a kind off the real tree's raw line", () => {
    expect(notDrawnKind(parse("@startuml\nusecase U\n@enduml\n"))).toBe("use case");
    expect(notDrawnKind(parse("@startuml\nnode N\n@enduml\n"))).toBe("deployment");
  });

  it("keeps looking past a raw line that names no kind", () => {
    const root = stub("source_file", [
      stub("raw_line", [], { text: "starter" }),
      stub("raw_line", [], { text: "usecase U" }),
    ]);
    expect(notDrawnKind(root)).toBe("use case");
  });

  it("reports the first kind found", () => {
    const root = stub("source_file", [
      stub("raw_line", [], { text: "component C" }),
      stub("raw_line", [], { text: "usecase U" }),
    ]);
    expect(notDrawnKind(root)).toBe("component");
  });

  it("treats structural activity nodes as activity", () => {
    expect(notDrawnKind(parse("@startuml\n:a;\n@enduml\n"))).toBe("activity");
    expect(notDrawnKind(stub("source_file", [stub("swimlane")]))).toBe("activity");
  });

  it("treats a parse error holding a pseudostate as state", () => {
    const root = stub("source_file", [stub("ERROR", [], { text: "[*] -->" })]);
    expect(notDrawnKind(root)).toBe("state");
    expect(notDrawnKind(stub("source_file", [stub("ERROR", [], { text: "}" })]))).toBeUndefined();
  });

  it("does not scan note bodies or entity bodies", () => {
    expect(
      notDrawnKind(parse("@startuml\nclass A\nnote left of A\nusecase foo\nend note\n@enduml\n")),
    ).toBeUndefined();
    const raw = stub("raw_line", [], { text: "usecase U" });
    expect(notDrawnKind(stub("source_file", [stub("entity_body", [raw])]))).toBeUndefined();
    expect(notDrawnKind(stub("source_file", [stub("note_statement", [raw])]))).toBeUndefined();
  });

  it("returns nothing for a diagram the subset draws", () => {
    expect(notDrawnKind(parse("@startuml\nclass A\nA --> B\n@enduml\n"))).toBeUndefined();
  });
});

describe("notDrawnNotice", () => {
  it("capitalises the kind into a fixed sentence", () => {
    expect(notDrawnNotice("mindmap")).toBe(
      "Mindmap diagram: not drawn by plantuml-render (kept lossless).",
    );
  });

  it("leaves the rest of the kind as written", () => {
    expect(notDrawnNotice("use case")).toBe(
      "Use case diagram: not drawn by plantuml-render (kept lossless).",
    );
    expect(notDrawnNotice("JSON")).toBe(
      "JSON diagram: not drawn by plantuml-render (kept lossless).",
    );
  });
});

describe("diagramTitle", () => {
  it("reads the name on the start tag", () => {
    expect(diagramTitle(parse("@startuml demo\nclass A\n@enduml\n"))).toBe("demo");
  });

  it("is undefined for a diagram without a name", () => {
    expect(diagramTitle(parse("@startuml\nclass A\n@enduml\n"))).toBeUndefined();
  });

  it("is undefined for a tree without a diagram", () => {
    expect(diagramTitle(parse(""))).toBeUndefined();
  });

  it("trims the name and treats a blank one as absent", () => {
    const named = (text: string) =>
      stub("source_file", [stub("diagram", [], { fields: { name: stub("diagram_name", [], { text }) } })]);
    expect(diagramTitle(named("  spaced  "))).toBe("spaced");
    expect(diagramTitle(named("   "))).toBeUndefined();
  });
});

describe("hyperlink", () => {
  it("reads a plain url", () => {
    expect(hyperlink("[[http://x]]")).toEqual({ href: "http://x" });
  });

  it("reads a url with an explanation", () => {
    expect(hyperlink("[[http://x{tip}]]")).toEqual({ href: "http://x", title: "tip" });
  });

  it("reads an explanation with no url", () => {
    expect(hyperlink("[[{only tip}]]")).toEqual({ title: "only tip" });
  });

  it("trims surrounding and inner whitespace", () => {
    expect(hyperlink("  [[ http://x { tip } ]]  ")).toEqual({ href: "http://x", title: "tip" });
  });

  it("drops a blank explanation", () => {
    expect(hyperlink("[[http://x{  }]]")).toEqual({ href: "http://x" });
    expect(hyperlink("[[{  }]]")).toEqual({});
  });

  it.each(["[[]]", "[[{}]]", "http://x", "[[http://x]] trailing", "[http://x]"])(
    "yields nothing for %j",
    (text) => {
      expect(hyperlink(text)).toEqual({});
    },
  );
});

describe("portDirection", () => {
  it("accepts the two markers in any case", () => {
    expect(portDirection("in")).toBe("in");
    expect(portDirection("out")).toBe("out");
    expect(portDirection("IN")).toBe("in");
    expect(portDirection("Out")).toBe("out");
  });

  it("rejects everything else", () => {
    expect(portDirection(undefined)).toBeUndefined();
    expect(portDirection("")).toBeUndefined();
    expect(portDirection("block")).toBeUndefined();
    expect(portDirection("inout")).toBeUndefined();
  });
});

describe("splitPorts", () => {
  it("is undefined for a declaration without a body", () => {
    expect(splitPorts(classDecl("class S <<block>>"))).toBeUndefined();
  });

  it("gives empty results for an empty body", () => {
    expect(splitPorts(classDecl("class S <<block>> {\n}"))).toEqual({ ports: [], rest: {} });
  });

  it("reads direction, name and type off port members", () => {
    const split = splitPorts(
      classDecl("class S <<block>> {\n + in ref : double\n - out u\n IN a\n # OUT x : y : z\n}"),
    );
    expect(split?.ports).toEqual([
      { id: "ref", kind: "port", label: "ref", direction: "in", title: "ref : double" },
      { id: "u", kind: "port", label: "u", direction: "out" },
      { id: "a", kind: "port", label: "a", direction: "in" },
      { id: "x", kind: "port", label: "x", direction: "out", title: "x : y : z" },
    ]);
    expect(split?.rest).toEqual({});
  });

  it("keeps ordinary members beside the ports, in their compartments", () => {
    const split = splitPorts(
      classDecl("class S <<block>> {\n + in ref\n + gain : int\n + step() : void\n}"),
    );
    expect(split?.ports.map((p) => p.id)).toEqual(["ref"]);
    expect(split?.rest).toEqual({
      sections: [["+ gain : int"], ["+ step() : void"]],
      sectionKinds: ["attributes", "methods"],
    });
  });

  it("does not take a method for a port even if it reads like one", () => {
    const split = splitPorts(classDecl("class S <<block>> {\n + in go() : void\n}"));
    expect(split?.ports).toEqual([]);
    expect(split?.rest).toEqual({ sections: [["+ in go() : void"]], sectionKinds: ["methods"] });
  });

  it("only reads members", () => {
    const body = stub("entity_body", [
      stub("comment", [], { text: "in ghost" }),
      stub("member", [], { text: " out real " }),
    ]);
    const split = splitPorts(stub("class_declaration", [], { fields: { body } }));
    expect(split?.ports).toEqual([{ id: "real", kind: "port", label: "real", direction: "out" }]);
  });
});

describe("memberSections", () => {
  it("is undefined without a body", () => {
    expect(memberSections(classDecl("class A"))).toBeUndefined();
  });

  it("is undefined for an empty body", () => {
    expect(memberSections(classDecl("class A {\n}"))).toBeUndefined();
  });

  it("holds attributes alone in one compartment", () => {
    expect(memberSections(classDecl("class A {\n + x : int\n y\n}"))).toEqual({
      sections: [["+ x : int", "y"]],
      sectionKinds: ["attributes"],
    });
  });

  it("holds methods alone in one compartment", () => {
    expect(memberSections(classDecl("class A {\n + run()\n}"))).toEqual({
      sections: [["+ run()"]],
      sectionKinds: ["methods"],
    });
  });

  it("puts attributes before methods whatever the source order", () => {
    expect(memberSections(classDecl("class A {\n + run()\n + x : int\n + stop()\n}"))).toEqual({
      sections: [["+ x : int"], ["+ run()", "+ stop()"]],
      sectionKinds: ["attributes", "methods"],
    });
  });

  it("only reads members", () => {
    const body = stub("entity_body", [
      stub("comment", [], { text: "ignored" }),
      stub("member", [], { text: " kept " }),
    ]);
    expect(memberSections(stub("class_declaration", [], { fields: { body } }))).toEqual({
      sections: [["kept"]],
      sectionKinds: ["attributes"],
    });
  });
});

describe("treeToIr", () => {
  describe("dispatch", () => {
    it("hands activity diagrams to the activity mapping", () => {
      const ir = treeToIr(parse("@startuml\nstart\n:a;\nstop\n@enduml\n"));
      expect(ir.nodes.map((n) => n.kind)).toEqual(["start", "action", "end"]);
      expect(ir.edges.every((e) => e.kind === "flow")).toBe(true);
    });

    it("hands state diagrams to the state mapping", () => {
      const ir = treeToIr(parse("@startuml\nstate S {\n}\n@enduml\n"));
      expect(ir.nodes).toEqual([{ id: "S", kind: "action", label: "S" }]);
    });

    it("hands sequence diagrams to the sequence mapping", () => {
      const ir = treeToIr(parse("@startuml\nparticipant A\nA -> B\n@enduml\n"));
      expect(ir.nodes.map((n) => n.kind)).toEqual(["lifeline", "lifeline"]);
      expect(ir.edges[0].kind).toBe("message");
    });

    it("carries a notice and the title for a kind it does not draw", () => {
      expect(treeToIr(parse("@startuml seen\nusecase U\n@enduml\n"))).toEqual({
        ir: 1,
        title: "seen",
        nodes: [],
        edges: [],
        notice: "Use case diagram: not drawn by plantuml-render (kept lossless).",
      });
    });

    it("yields an empty drawing for an empty source", () => {
      expect(treeToIr(parse(""))).toEqual({ ir: 1, title: undefined, nodes: [], edges: [] });
    });
  });

  describe("containers", () => {
    it("opens one container per dotted segment and shares the outer ones", () => {
      const ir = treeToIr(
        parse("@startuml\nnamespace a.b {\n class X\n}\nnamespace a.c {\n class Y\n}\n@enduml\n"),
      );
      expect(ir.nodes.map((n) => [n.id, n.kind, n.parent])).toEqual([
        ["a", "container", undefined],
        ["a.b", "container", "a"],
        ["a.b.X", "box", "a.b"],
        ["a.c", "container", "a"],
        ["a.c.Y", "box", "a.c"],
      ]);
      expect(ir.nodes[1]).toMatchObject({ label: "b", classifier: "namespace" });
    });

    it("merges a reopened namespace and a re-declared entity by id", () => {
      const ir = treeToIr(
        parse("@startuml\nnamespace n {\n class X\n}\nnamespace n {\n class X {\n + y\n }\n}\n@enduml\n"),
      );
      expect(ir.nodes.map((n) => n.id)).toEqual(["n", "n.X"]);
      expect(ir.nodes[1].sections).toBeUndefined();
    });

    it("puts the stereotype on the innermost segment only and unquotes the name", () => {
      const outer = treeToIr(parse('@startuml\npackage "Pk" <<lib>> {\n class Q\n}\n@enduml\n'));
      expect(outer.nodes[0]).toEqual({
        id: "Pk",
        kind: "container",
        label: "Pk",
        classifier: "package",
        stereotype: "lib",
        parent: undefined,
      });
      const dotted = treeToIr(parse("@startuml\npackage a.b <<lib>> {\n}\n@enduml\n"));
      expect(dotted.nodes.map((n) => n.stereotype)).toEqual([undefined, "lib"]);
    });
  });

  describe("entities", () => {
    it("maps the classifier, the abstract flag and the stereotype", () => {
      const ir = treeToIr(
        parse("@startuml\nabstract class B\ninterface I\nenum E {\n RED\n}\nclass R <<svc>>\n@enduml\n"),
      );
      expect(ir.nodes.map((n) => [n.id, n.classifier, n.abstract, n.stereotype])).toEqual([
        ["B", "class", true, undefined],
        ["I", "interface", undefined, undefined],
        ["E", "enum", undefined, undefined],
        ["R", "class", undefined, "svc"],
      ]);
      expect(ir.nodes[2]).toMatchObject({ sections: [["RED"]], sectionKinds: ["attributes"] });
    });

    it("addresses an aliased entity by its alias", () => {
      const ir = treeToIr(parse('@startuml\nclass "Nice Name" as NN\nNN --> NN\n@enduml\n'));
      expect(ir.nodes.map((n) => n.id)).toEqual(["NN"]);
      expect(ir.edges[0]).toMatchObject({ from: "NN", to: "NN" });
    });

    it("copies a head hyperlink onto the box", () => {
      const ir = treeToIr(
        parse("@startuml\nclass K [[http://x{tip}]]\nclass H [[{only tip}]]\n@enduml\n"),
      );
      expect(ir.nodes[0]).toMatchObject({ href: "http://x", title: "tip" });
      expect(ir.nodes[1]).toMatchObject({ title: "only tip" });
      expect(ir.nodes[1].href).toBeUndefined();
    });
  });

  describe("ports", () => {
    it("draws a block's port members as ports owned by the block", () => {
      const ir = treeToIr(
        parse("@startuml\nclass S <<block>> {\n + in ref : double\n + gain : int\n}\n@enduml\n"),
      );
      expect(ir.nodes).toEqual([
        {
          id: "S",
          kind: "box",
          label: "S",
          classifier: "class",
          stereotype: "block",
          sections: [["+ gain : int"]],
          sectionKinds: ["attributes"],
        },
        {
          id: "S.ref",
          kind: "port",
          label: "ref",
          direction: "in",
          title: "ref : double",
          parent: "S",
        },
      ]);
    });

    it("reads port-like members as plain members outside a block", () => {
      const ir = treeToIr(parse("@startuml\nclass P {\n + in a\n}\n@enduml\n"));
      expect(ir.nodes).toHaveLength(1);
      expect(ir.nodes[0]).toMatchObject({ kind: "box", sections: [["+ in a"]] });
    });

    it("turns marked children of a block container into boundary ports", () => {
      const ir = treeToIr(
        parse("@startuml\npackage P <<block>> {\n class a <<in>>\n class b <<OUT>>\n class c\n}\n@enduml\n"),
      );
      expect(ir.nodes.map((n) => [n.id, n.kind, n.direction])).toEqual([
        ["P", "container", undefined],
        ["P.a", "port", "in"],
        ["P.b", "port", "out"],
        ["P.c", "box", undefined],
      ]);
    });

    it("leaves a port marker alone outside a block container", () => {
      const ir = treeToIr(
        parse("@startuml\nclass a <<in>>\npackage P {\n class b <<in>>\n}\n@enduml\n"),
      );
      expect(ir.nodes.map((n) => [n.id, n.kind, n.stereotype])).toEqual([
        ["a", "box", "in"],
        ["P", "container", undefined],
        ["P.b", "box", "in"],
      ]);
    });

    it("resolves Block::port to the port's id", () => {
      const ir = treeToIr(
        parse("@startuml\nnamespace n {\n class S <<block>> {\n + out u\n }\n}\nclass K\nS::u --> K\n@enduml\n"),
      );
      expect(ir.nodes.map((n) => n.id)).toContain("n.S.u");
      expect(ir.edges[0]).toMatchObject({ from: "n.S.u", to: "K" });
    });
  });

  describe("relations", () => {
    it("stores reversed relations canonically with their label", () => {
      const ir = treeToIr(parse("@startuml\nclass A\nclass B\nB <|-- A : is\n@enduml\n"));
      expect(ir.edges).toEqual([{ from: "A", to: "B", kind: "inheritance", label: "is" }]);
    });

    it("takes a trailing link out of the label", () => {
      const ir = treeToIr(
        parse("@startuml\nclass A\nA --> A : text [[http://y{why}]]\nA --> A : [[http://z]]\n@enduml\n"),
      );
      expect(ir.edges[0]).toEqual({
        from: "A", to: "A", kind: "association", label: "text", href: "http://y", title: "why",
      });
      expect(ir.edges[1]).toEqual({
        from: "A", to: "A", kind: "association", label: undefined, href: "http://z",
      });
    });

    it("drops a relation whose operator it cannot decode", () => {
      const relation = stub("relation", [], {
        fields: {
          left: stub("identifier", [], { text: "A" }),
          operator: stub("relation_operator", [], { text: "=>" }),
          right: stub("identifier", [], { text: "B" }),
        },
      });
      expect(treeToIr(stub("source_file", [relation]))).toEqual({
        ir: 1, title: undefined, nodes: [], edges: [],
      });
    });

    it("requalifies short names to placed ids", () => {
      const ir = treeToIr(
        parse("@startuml\nnamespace n {\n class A\n class B\n A --> B\n}\n@enduml\n"),
      );
      expect(ir.edges[0]).toMatchObject({ from: "n.A", to: "n.B" });
    });

    it("resolves a unique qualified tail and leaves unknown names alone", () => {
      const ir = treeToIr(
        parse("@startuml\nnamespace Top.o {\n class A\n}\nclass U\nU --> o.A\nU --> Other\n@enduml\n"),
      );
      expect(ir.edges.map((e) => e.to)).toEqual(["Top.o.A", "Other"]);
    });

    it("refuses to guess a qualified tail two entities share", () => {
      const ir = treeToIr(
        parse("@startuml\nnamespace a.x {\n class T\n}\nnamespace b.x {\n class T\n}\nclass U\nU --> x.T\n@enduml\n"),
      );
      expect(ir.edges[0].to).toBe("x.T");
    });
  });

  describe("notes", () => {
    it("draws an anchored note and attaches it by the resolved id", () => {
      const ir = treeToIr(
        parse("@startuml\nnamespace n {\n class A\n}\nnote left of A : hey\n@enduml\n"),
      );
      expect(ir.nodes).toContainEqual({
        id: "note-1", kind: "note", label: "hey", sections: undefined, parent: undefined,
      });
      expect(ir.edges).toEqual([{ from: "note-1", to: "n.A", kind: "attachment" }]);
    });

    it("heads a multi-line note with the first line, the rest as a section", () => {
      const ir = treeToIr(
        parse("@startuml\nclass A\nnote right of A\nl1\nl2\nl3\nend note\n@enduml\n"),
      );
      expect(ir.nodes[1]).toMatchObject({ label: "l1", sections: [["l2", "l3"]] });
    });

    it("keeps a one-line body without a section", () => {
      const ir = treeToIr(parse("@startuml\nclass A\nnote right of A\nl1\nend note\n@enduml\n"));
      expect(ir.nodes[1].label).toBe("l1");
      expect(ir.nodes[1].sections).toBeUndefined();
    });

    it("places a note in its container and counts notes across the tree", () => {
      const ir = treeToIr(
        parse("@startuml\nnamespace N {\n note right of Z : one\n}\nnote right of Z : two\n@enduml\n"),
      );
      expect(ir.nodes.filter((n) => n.kind === "note").map((n) => [n.id, n.label, n.parent])).toEqual([
        ["note-1", "one", "N"],
        ["note-2", "two", undefined],
      ]);
    });

    it("falls back to a placeholder note with nothing written", () => {
      const ir = treeToIr(stub("source_file", [stub("note_statement")]));
      expect(ir.nodes).toEqual([
        { id: "note-1", kind: "note", label: "note", sections: undefined, parent: undefined },
      ]);
      expect(ir.edges).toEqual([]);
    });
  });

  describe("relations with nothing to draw", () => {
    it("says how many relations have no declared entity", () => {
      const ir = treeToIr(parse("@startuml\nA --> B\nC --> D\n@enduml\n"));
      expect(ir.nodes).toEqual([]);
      expect(ir.edges).toHaveLength(2);
      expect(ir.notice).toBe(
        "Nothing drawn: 2 relations reference entities that are not declared in this diagram.",
      );
    });

    it("counts a single relation in the singular", () => {
      const ir = treeToIr(parse("@startuml\nA --> B\n@enduml\n"));
      expect(ir.notice).toMatch(/^Nothing drawn: 1 relation /);
    });

    it("carries no notice once anything is declared", () => {
      const ir = treeToIr(parse("@startuml demo\nclass A\nA --> B\n@enduml\n"));
      expect(ir.title).toBe("demo");
      expect(ir.notice).toBeUndefined();
    });
  });
});
