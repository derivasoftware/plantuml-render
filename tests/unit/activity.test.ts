// @covers render.activity.isActivity, render.activity.paren, render.activity.actionText
// @covers render.activity.activityToIr
import { beforeAll, describe, expect, it } from "vitest";

import { actionText, activityToIr, isActivity, paren } from "../../src/render/activity.js";
import type { CstNode } from "../../src/render/frontend-core.js";
import { load } from "../../src/render/frontend.js";

type Parser = Awaited<ReturnType<typeof load>>;
let parser: Parser;

beforeAll(async () => {
  parser = await load();
});

/** The real tree of a source, as the frontend hands it over. */
const tree = (source: string) => parser.parse(source)!.rootNode as unknown as CstNode;
const uml = (...lines: string[]) => `@startuml\n${lines.join("\n")}\n@enduml\n`;
const toIr = (...lines: string[]) => activityToIr(tree(uml(...lines)));

/** A hand-made node, for the shapes a real parse does not reach on its own. */
const fake = (type: string, namedChildren: CstNode[] = []): CstNode => ({
  type,
  text: "",
  children: namedChildren,
  namedChildren,
  childForFieldName: () => null,
});

describe("paren", () => {
  it("drops one pair of surrounding parens and trims", () => {
    expect(paren("(ok?)")).toBe("ok?");
    expect(paren("( spaced out )")).toBe("spaced out");
  });

  it("gives an empty string for undefined and for empty parens", () => {
    expect(paren(undefined)).toBe("");
    expect(paren("()")).toBe("");
  });

  it("removes only one layer and leaves inner parens alone", () => {
    expect(paren("((a))")).toBe("(a)");
    expect(paren("(f(x) ok)")).toBe("f(x) ok");
  });

  it("leaves text without parens as it is, trimmed", () => {
    expect(paren("  plain ")).toBe("plain");
  });
});

describe("actionText", () => {
  it("removes the leading colon and the closing semicolon", () => {
    expect(actionText(":do the thing;")).toBe("do the thing");
  });

  it.each([";", "|", "<", ">", "/", "]", "}"])("treats %s as a closing terminator", (end) => {
    expect(actionText(`:step${end}`)).toBe("step");
  });

  it("ignores whitespace after the terminator", () => {
    expect(actionText(":step;  \n")).toBe("step");
  });

  it("removes only one terminator and keeps the punctuation inside", () => {
    expect(actionText(":a; b;;")).toBe("a; b;");
  });

  it("keeps text that has neither colon nor terminator", () => {
    expect(actionText("plain words")).toBe("plain words");
  });
});

describe("isActivity", () => {
  it.each([
    "activity_action", "activity_control", "activity_arrow", "if_block", "while_block",
    "repeat_block", "fork_block", "split_block", "switch_block", "partition_block", "swimlane",
  ])("recognises %s anywhere in the tree", (type) => {
    expect(isActivity(fake(type))).toBe(true);
    expect(isActivity(fake("source_file", [fake("diagram", [fake(type)])]))).toBe(true);
  });

  it("is false for a tree with no activity statement", () => {
    expect(isActivity(fake("source_file"))).toBe(false);
    expect(isActivity(fake("source_file", [fake("diagram", [fake("class_declaration")])]))).toBe(false);
  });

  it.each(["note_statement", "entity_body"])("does not look inside %s", (shield) => {
    expect(isActivity(fake("diagram", [fake(shield, [fake("activity_action")])]))).toBe(false);
  });

  it("still finds a statement beside a shielded subtree", () => {
    const root = fake("diagram", [fake("note_statement", [fake("if_block")]), fake("activity_control")]);
    expect(isActivity(root)).toBe(true);
  });

  it("classifies real parses", () => {
    expect(isActivity(tree(uml("start", ":a;", "stop")))).toBe(true);
    expect(isActivity(tree(uml("class A", "A --> A")))).toBe(false);
    expect(isActivity(tree(uml("class A {", "  +x", "}", "note left of A", "start", "end note")))).toBe(false);
  });
});

describe("activityToIr", () => {
  it("chains statements in source order and takes the diagram's name as title", () => {
    const ir = activityToIr(tree("@startuml flow\nstart\n:one;\n:two;\nstop\n@enduml\n"));
    expect(ir.ir).toBe(1);
    expect(ir.title).toBe("flow");
    expect(ir.nodes.map((n) => [n.id, n.kind, n.label])).toEqual([
      ["start-1", "start", ""],
      ["action-1", "action", "one"],
      ["action-2", "action", "two"],
      ["stop-1", "end", ""],
    ]);
    expect(ir.edges).toEqual([
      { from: "start-1", to: "action-1", kind: "flow" },
      { from: "action-1", to: "action-2", kind: "flow" },
      { from: "action-2", to: "stop-1", kind: "flow" },
    ]);
  });

  it("gives an empty document for a root with no diagram", () => {
    expect(activityToIr(fake("source_file"))).toEqual({ ir: 1, nodes: [], edges: [] });
  });

  it("classifies `stop` and `end` and closes the flow after them", () => {
    const ir = toIr("start", "end", ":orphan;");
    expect(ir.nodes.find((n) => n.kind === "end")).toMatchObject({ id: "end-1", classifier: "end" });
    expect(ir.edges).toEqual([{ from: "start-1", to: "end-1", kind: "flow" }]);
  });

  it.each(["kill", "detach"])("`%s` closes the flow without drawing a node", (word) => {
    const ir = toIr(":a;", word, ":b;");
    expect(ir.nodes.map((n) => n.label)).toEqual(["a", "b"]);
    expect(ir.edges).toEqual([]);
  });

  it("ignores a `break` outside any loop", () => {
    const ir = toIr(":a;", "break", ":b;");
    expect(ir.edges).toEqual([{ from: "action-1", to: "action-2", kind: "flow" }]);
  });

  it("puts a labelled arrow's text on the next edge only", () => {
    const ir = toIr(":a;", "-> go now;", ":b;", ":c;");
    expect(ir.edges).toEqual([
      { from: "action-1", to: "action-2", kind: "flow", label: "go now" },
      { from: "action-2", to: "action-3", kind: "flow" },
    ]);
  });

  it("maps if / elseif / else to chained decisions that rejoin", () => {
    const ir = toIr(
      "if (ok?) then (yes)", ":a;",
      "elseif (other?) then (maybe)", ":b;",
      "else (no)", ":c;",
      "endif", ":after;",
    );
    expect(ir.nodes.filter((n) => n.kind === "decision").map((n) => n.label)).toEqual(["ok?", "other?"]);
    expect(ir.edges).toEqual([
      { from: "decision-1", to: "action-1", kind: "flow", label: "yes" },
      { from: "decision-1", to: "decision-2", kind: "flow" },
      { from: "decision-2", to: "action-2", kind: "flow", label: "maybe" },
      { from: "decision-2", to: "action-3", kind: "flow", label: "no" },
      { from: "action-1", to: "action-4", kind: "flow" },
      { from: "action-2", to: "action-4", kind: "flow" },
      { from: "action-3", to: "action-4", kind: "flow" },
    ]);
  });

  it("lets the decision fall through when an if has no else", () => {
    const ir = toIr("if (ok?) then (yes)", ":a;", "endif", ":after;");
    expect(ir.edges).toEqual([
      { from: "decision-1", to: "action-1", kind: "flow", label: "yes" },
      { from: "action-1", to: "action-2", kind: "flow" },
      { from: "decision-1", to: "action-2", kind: "flow" },
    ]);
  });

  it("maps switch cases to labelled branches of one decision", () => {
    const ir = toIr("switch (x?)", "case (one)", ":a;", "case (two)", ":b;", "endswitch", ":after;");
    expect(ir.nodes.filter((n) => n.kind === "decision").map((n) => n.label)).toEqual(["x?"]);
    expect(ir.edges).toEqual([
      { from: "decision-1", to: "action-1", kind: "flow", label: "one" },
      { from: "decision-1", to: "action-2", kind: "flow", label: "two" },
      { from: "action-1", to: "action-3", kind: "flow" },
      { from: "action-2", to: "action-3", kind: "flow" },
    ]);
  });

  it("loops a while back to its decision and leaves through the exit label", () => {
    const ir = toIr("while (more?) is (yes)", ":work;", "endwhile (no)", ":after;");
    expect(ir.edges).toEqual([
      { from: "decision-1", to: "action-1", kind: "flow", label: "yes" },
      { from: "action-1", to: "decision-1", kind: "flow" },
      { from: "decision-1", to: "action-2", kind: "flow", label: "no" },
    ]);
  });

  it("sends a `break` to whatever follows the loop", () => {
    const ir = toIr("while (more?) is (yes)", "if (fail?) then (y)", "break", "endif", "endwhile (no)", ":after;");
    expect(ir.edges).toContainEqual({ from: "decision-2", to: "action-1", kind: "flow", label: "y" });
    expect(ir.edges).toContainEqual({ from: "decision-1", to: "action-1", kind: "flow", label: "no" });
  });

  it("draws a repeat body before its decision, with the backward action on the way back", () => {
    const ir = toIr("repeat :init;", ":work;", "backward :retry;", "repeat while (again?) is (yes) not (no)", ":after;");
    expect(ir.nodes.map((n) => [n.id, n.label])).toEqual([
      ["action-1", "init"],
      ["action-2", "work"],
      ["decision-1", "again?"],
      ["action-3", "retry"],
      ["action-4", "after"],
    ]);
    expect(ir.edges).toEqual([
      { from: "action-1", to: "action-2", kind: "flow" },
      { from: "action-2", to: "decision-1", kind: "flow" },
      { from: "decision-1", to: "action-3", kind: "flow", label: "yes" },
      { from: "action-3", to: "action-1", kind: "flow" },
      { from: "decision-1", to: "action-4", kind: "flow", label: "no" },
    ]);
  });

  it("opens a fork with a bar and closes it with a join bar", () => {
    const ir = toIr("fork", ":a;", "fork again", ":b;", "end fork", ":c;");
    expect(ir.nodes.filter((n) => n.kind === "bar").map((n) => [n.id, n.classifier])).toEqual([
      ["fork-1", "fork"],
      ["join-1", "join"],
    ]);
    expect(ir.edges).toEqual([
      { from: "fork-1", to: "action-1", kind: "flow" },
      { from: "fork-1", to: "action-2", kind: "flow" },
      { from: "action-1", to: "join-1", kind: "flow" },
      { from: "action-2", to: "join-1", kind: "flow" },
      { from: "join-1", to: "action-3", kind: "flow" },
    ]);
  });

  it("draws no join bar for `end merge`: the branches reach the next node directly", () => {
    const ir = toIr("fork", ":a;", "fork again", ":b;", "end merge", ":c;");
    expect(ir.nodes.filter((n) => n.kind === "bar").map((n) => n.classifier)).toEqual(["fork"]);
    expect(ir.edges).toContainEqual({ from: "action-1", to: "action-3", kind: "flow" });
    expect(ir.edges).toContainEqual({ from: "action-2", to: "action-3", kind: "flow" });
  });

  it("gives a split no bars: each branch hangs off what came before", () => {
    const ir = toIr(":first;", "split", ":a;", "split again", ":b;", "end split", ":c;");
    expect(ir.nodes.some((n) => n.kind === "bar")).toBe(false);
    expect(ir.edges).toEqual([
      { from: "action-1", to: "action-2", kind: "flow" },
      { from: "action-1", to: "action-3", kind: "flow" },
      { from: "action-2", to: "action-4", kind: "flow" },
      { from: "action-3", to: "action-4", kind: "flow" },
    ]);
  });

  it("parents statements to a partition container, unquoting its name", () => {
    const ir = toIr('partition "Part 1" {', ":a;", "}", ":b;");
    expect(ir.nodes[0]).toMatchObject({ id: "partition-1", kind: "container", label: "Part 1", classifier: "partition" });
    expect(ir.nodes.find((n) => n.label === "a")?.parent).toBe("partition-1");
    expect(ir.nodes.find((n) => n.label === "b")?.parent).toBeUndefined();
  });

  it("makes one container per swimlane name and returns to it on re-entry", () => {
    const ir = toIr("|Lane A|", ":a;", "|#pink|Lane B|", ":b;", "|Lane A|", ":c;");
    expect(ir.nodes.filter((n) => n.classifier === "swimlane").map((n) => [n.id, n.label])).toEqual([
      ["lane-1", "Lane A"],
      ["lane-2", "Lane B"],
    ]);
    expect(ir.nodes.filter((n) => n.kind === "action").map((n) => [n.label, n.parent])).toEqual([
      ["a", "lane-1"],
      ["b", "lane-2"],
      ["c", "lane-1"],
    ]);
  });

  it("nests a partition inside the lane that is current", () => {
    const ir = toIr("|L|", 'partition "P" {', ":a;", "}");
    expect(ir.nodes.find((n) => n.classifier === "partition")?.parent).toBe("lane-1");
    expect(ir.nodes.find((n) => n.label === "a")?.parent).toBe("partition-1");
  });

  it("attaches a one-line note to the last node without joining the flow", () => {
    const ir = toIr(":a;", "note right: hi", ":b;");
    expect(ir.nodes.find((n) => n.kind === "note")).toMatchObject({ id: "note-1", label: "hi" });
    expect(ir.edges).toEqual([
      { from: "note-1", to: "action-1", kind: "attachment" },
      { from: "action-1", to: "action-2", kind: "flow" },
    ]);
  });

  it("splits a block note into a label and a section", () => {
    const ir = toIr(":a;", "note left", "line1", "line2", "line3", "end note");
    expect(ir.nodes.find((n) => n.kind === "note")).toMatchObject({ label: "line1", sections: [["line2", "line3"]] });
  });

  it("leaves a one-line block note without sections", () => {
    const ir = toIr(":a;", "note left", "only", "end note");
    const note = ir.nodes.find((n) => n.kind === "note");
    expect(note?.label).toBe("only");
    expect(note?.sections).toBeUndefined();
  });

  it("draws no attachment for a note with nothing before it", () => {
    const ir = toIr("note right: lonely", ":a;");
    expect(ir.nodes[0]).toMatchObject({ kind: "note", label: "lonely" });
    expect(ir.edges).toEqual([]);
  });
});
