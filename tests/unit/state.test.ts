// @covers render.state.isState, render.state.strip, render.state.link
// @covers render.state.stateToIr
import { beforeAll, describe, expect, it } from "vitest";

import type { CstNode } from "../../src/render/frontend-core.js";
import { load } from "../../src/render/frontend.js";
import { isState, link, stateToIr, strip } from "../../src/render/state.js";

type Parser = Awaited<ReturnType<typeof load>>;
let parser: Parser;

beforeAll(async () => {
  parser = await load();
});

const tree = (source: string) => parser.parse(source)!.rootNode as unknown as CstNode;
const uml = (...lines: string[]) => `@startuml\n${lines.join("\n")}\n@enduml\n`;
const toIr = (...lines: string[]) => stateToIr(tree(uml(...lines)));

const fake = (type: string, namedChildren: CstNode[] = [], text = ""): CstNode => ({
  type,
  text,
  children: namedChildren,
  namedChildren,
  childForFieldName: () => null,
});
const textNode = (text: string) => fake("label", [], text);

const START = "\u0000start";
const END = "\u0000end";

describe("strip", () => {
  it("removes the surrounding quotes", () => {
    expect(strip('"A long name"')).toBe("A long name");
  });

  it("removes a lone quote at either end and keeps the inner ones", () => {
    expect(strip('"open')).toBe("open");
    expect(strip('close"')).toBe("close");
    expect(strip('say "hi" now')).toBe('say "hi" now');
  });

  it("leaves unquoted and empty text as it is", () => {
    expect(strip("Idle")).toBe("Idle");
    expect(strip("")).toBe("");
  });
});

describe("link", () => {
  it("is empty for no node", () => {
    expect(link(null)).toEqual({});
  });

  it("reads a url", () => {
    expect(link(textNode("[[https://x.dev/a]]"))).toEqual({ href: "https://x.dev/a" });
  });

  it("reads a url with an explanation", () => {
    expect(link(textNode("[[https://x.dev/a{Read this}]]"))).toEqual({ href: "https://x.dev/a", title: "Read this" });
  });

  it("reads an explanation alone", () => {
    expect(link(textNode("[[{Only a tip}]]"))).toEqual({ title: "Only a tip" });
  });

  it("trims the padding around the url and the explanation", () => {
    expect(link(textNode("  [[ https://x.dev { tip } ]]  "))).toEqual({ href: "https://x.dev", title: "tip" });
  });

  it("drops a blank explanation", () => {
    expect(link(textNode("[[https://x.dev{  }]]"))).toEqual({ href: "https://x.dev" });
    expect(link(textNode("[[{  }]]"))).toEqual({});
  });

  it("is empty for an empty link or for text that is not one", () => {
    expect(link(textNode("[[]]"))).toEqual({});
    expect(link(textNode("https://x.dev"))).toEqual({});
    expect(link(textNode("[[https://x.dev]"))).toEqual({});
  });
});

describe("isState", () => {
  it.each(["state_block", "pseudostate"])("recognises %s anywhere in the tree", (type) => {
    expect(isState(fake(type))).toBe(true);
    expect(isState(fake("source_file", [fake("diagram", [fake("relation", [fake(type)])])]))).toBe(true);
  });

  it("is false for a tree with neither", () => {
    expect(isState(fake("source_file"))).toBe(false);
    expect(isState(fake("diagram", [fake("relation")]))).toBe(false);
  });

  it.each(["entity_body", "note_statement"])("does not look inside %s", (shield) => {
    expect(isState(fake("diagram", [fake(shield, [fake("state_block")])]))).toBe(false);
  });

  it("still finds a state beside a shielded subtree", () => {
    expect(isState(fake("diagram", [fake("entity_body", [fake("state_block")]), fake("state_block")]))).toBe(true);
  });

  it("classifies real parses", () => {
    expect(isState(tree(uml("state A")))).toBe(true);
    expect(isState(tree(uml("[*] --> A")))).toBe(true);
    expect(isState(tree(uml("class A", "A --> A")))).toBe(false);
  });
});

describe("stateToIr", () => {
  it("makes a state of every name a transition uses, once, with the diagram's name as title", () => {
    const ir = stateToIr(tree("@startuml lights\nIdle --> Running\nRunning --> Idle\n@enduml\n"));
    expect(ir.ir).toBe(1);
    expect(ir.title).toBe("lights");
    expect(ir.nodes).toEqual([
      { id: "Idle", kind: "action", label: "Idle" },
      { id: "Running", kind: "action", label: "Running" },
    ]);
    expect(ir.edges).toEqual([
      { from: "Idle", to: "Running", kind: "flow" },
      { from: "Running", to: "Idle", kind: "flow" },
    ]);
    expect(ir.notice).toBeUndefined();
    expect("notice" in ir).toBe(false);
  });

  it("reads [*] as a start where a transition leaves it and an end where one arrives", () => {
    const ir = toIr("[*] --> A", "A --> [*]");
    expect(ir.nodes.map((n) => [n.id, n.kind])).toEqual([
      [START, "start"],
      ["A", "action"],
      [END, "end"],
    ]);
    expect(ir.edges.map((e) => [e.from, e.to])).toEqual([
      [START, "A"],
      ["A", END],
    ]);
  });

  it("shares one terminal per kind across every arrow of a level", () => {
    const ir = toIr("[*] --> A", "[*] --> B", "A --> [*]", "B --> [*]");
    expect(ir.nodes.filter((n) => n.kind === "start")).toHaveLength(1);
    expect(ir.nodes.filter((n) => n.kind === "end")).toHaveLength(1);
    expect(ir.edges).toHaveLength(4);
  });

  it("keeps a transition's label as written", () => {
    const ir = toIr("Idle --> Running : go [ready] / log");
    expect(ir.edges[0].label).toBe("go [ready] / log");
  });

  it("takes a link written at the end of the label off the label", () => {
    const ir = toIr("A --> B : see [[https://x.dev{tip}]]");
    expect(ir.edges[0]).toEqual({ from: "A", to: "B", kind: "flow", label: "see", href: "https://x.dev", title: "tip" });
  });

  it("leaves no label when the label is only a link", () => {
    const ir = toIr("A --> B : [[https://x.dev]]");
    expect(ir.edges[0].href).toBe("https://x.dev");
    expect(ir.edges[0].label).toBeUndefined();
  });

  it("reads a link written after the arrow", () => {
    const ir = toIr("A --> B [[https://x.dev]]");
    expect(ir.edges[0]).toMatchObject({ from: "A", to: "B", href: "https://x.dev" });
  });

  it("shows the long name of `state \"…\" as X` and wires transitions through the alias", () => {
    const ir = toIr('state "Long name" as LN', "Idle --> LN");
    expect(ir.nodes.find((n) => n.id === "LN")).toEqual({ id: "LN", kind: "action", label: "Long name" });
    expect(ir.edges[0]).toMatchObject({ from: "Idle", to: "LN" });
  });

  it("turns a state with a body into a container and scopes what is inside", () => {
    const ir = toIr("state Comp {", "  [*] --> Inner", "  Inner --> [*]", "}");
    expect(ir.nodes.find((n) => n.id === "Comp")).toEqual({ id: "Comp", kind: "container", label: "Comp" });
    expect(ir.nodes.find((n) => n.id === "Comp.Inner")).toMatchObject({ label: "Inner", parent: "Comp" });
    expect(ir.nodes.find((n) => n.id === `Comp.${START}`)).toMatchObject({ kind: "start", parent: "Comp" });
    expect(ir.nodes.find((n) => n.id === `Comp.${END}`)).toMatchObject({ kind: "end", parent: "Comp" });
  });

  it("gives each level its own terminals", () => {
    const ir = toIr("[*] --> Comp", "state Comp {", "  [*] --> Inner", "}");
    expect(ir.nodes.filter((n) => n.kind === "start").map((n) => n.id)).toEqual([START, `Comp.${START}`]);
  });

  it("makes a container of a state a transition named before its body was declared", () => {
    const ir = toIr("Idle --> Comp", "state Comp {", "  A --> B", "}");
    expect(ir.nodes.filter((n) => n.id === "Comp")).toEqual([{ id: "Comp", kind: "container", label: "Comp" }]);
  });

  it("resolves a short name declared at another level to that state", () => {
    const ir = toIr("state Comp {", "  state Inner", "}", "Idle --> Inner");
    expect(ir.edges[0]).toMatchObject({ from: "Idle", to: "Comp.Inner" });
    expect(ir.nodes.filter((n) => n.label === "Inner")).toHaveLength(1);
  });

  it("collects `State : text` lines into the state's title, in order", () => {
    const ir = toIr("state Idle", "Idle : first", "Idle : second");
    expect(ir.nodes[0].title).toBe("first\nsecond");
  });

  it("ignores a `Name : text` line for a state nobody declared", () => {
    const ir = toIr("state Idle", "Ghost : boo");
    expect(ir.nodes.map((n) => n.id)).toEqual(["Idle"]);
    expect(ir.nodes[0].title).toBeUndefined();
  });

  it("keeps a stereotype and stays silent about one with no standard shape", () => {
    const ir = toIr("state A <<custom>>");
    expect(ir.nodes[0].stereotype).toBe("custom");
    expect(ir.notice).toBeUndefined();
  });

  it.each(["choice", "fork", "join", "entryPoint", "exitPoint", "inputPin", "outputPin", "expansionInput", "expansionOutput"])(
    "says in the notice that <<%s>> is drawn as a plain state",
    (stereotype) => {
      const ir = toIr(`state C <<${stereotype}>>`);
      expect(ir.nodes[0]).toMatchObject({ kind: "action", stereotype });
      expect(ir.notice).toBe("Drawn as plain states, not as their own shapes: pseudostate shapes.");
    },
  );

  it("draws history as a state of its level and says so", () => {
    const ir = toIr("state H {", "  [H] --> E", "}");
    expect(ir.nodes.find((n) => n.id === "H.[H]")).toEqual({ id: "H.[H]", kind: "action", label: "[H]", parent: "H" });
    expect(ir.edges[0]).toMatchObject({ from: "H.[H]", to: "H.E" });
    expect(ir.notice).toBe("Drawn as plain states, not as their own shapes: history.");
  });

  it("says when a composite has concurrent regions", () => {
    const ir = toIr("state Conc {", "  A --> B", "  --", "  C --> D", "}");
    expect(ir.notice).toBe("Drawn as plain states, not as their own shapes: concurrent regions.");
    expect(ir.nodes.map((n) => n.id)).toEqual(["Conc", "Conc.A", "Conc.B", "Conc.C", "Conc.D"]);
  });

  it("says when a note was left out, without drawing it", () => {
    const ir = toIr("state Idle", "note left of Idle : x");
    expect(ir.nodes.map((n) => n.kind)).toEqual(["action"]);
    expect(ir.notice).toBe("Drawn as plain states, not as their own shapes: notes.");
  });

  it("lists everything dropped once and sorted", () => {
    const ir = toIr("state C <<choice>>", "state D <<fork>>", "note left of C : x", "note left of D : y");
    expect(ir.notice).toBe("Drawn as plain states, not as their own shapes: notes, pseudostate shapes.");
  });
});
