/**
 * Activity frontend (spike PUML-53): tree-sitter CST of the new activity
 * syntax → render-IR flow graph. Statements are folded in source order
 * with a frontier of open flows: every new node receives the frontier's
 * flows (with their branch labels) and becomes the frontier itself.
 * if/elseif/else, switch, while, repeat, fork/join, split, swimlanes,
 * partitions, notes and labelled arrows are mapped; the rest is skipped.
 */

import type { CstNode } from "./frontend-core.js";
import { type IrEdge, type IrNode, type RenderIr } from "./ir.js";

type Node = CstNode;

const ACTIVITY_TYPES = new Set([
  "activity_action", "activity_control", "activity_arrow", "if_block", "while_block",
  "repeat_block", "fork_block", "split_block", "switch_block", "partition_block", "swimlane",
]);

/** A diagram is an activity diagram when any activity statement is
 * structural in its tree (grammar ≥ 0.11 parses the control flow). */
export function isActivity(root: Node): boolean {
  const walk = (node: Node): boolean => {
    if (ACTIVITY_TYPES.has(node.type)) return true;
    if (node.type === "note_statement" || node.type === "entity_body") return false;
    return node.namedChildren.some(walk);
  };
  return walk(root);
}

interface Open {
  from: string;
  label?: string;
}

const paren = (s: string | undefined) => (s ?? "").replace(/^\(/, "").replace(/\)$/, "").trim();
const actionText = (s: string) =>
  s.replace(/^#\S+/, "").replace(/^:/, "").replace(/[;|<>/\]}]\s*$/, "").trim();

export function activityToIr(root: Node): RenderIr {
  const nodes: IrNode[] = [];
  const edges: IrEdge[] = [];
  const counters = new Map<string, number>();
  const nextId = (kind: string) => {
    const n = (counters.get(kind) ?? 0) + 1;
    counters.set(kind, n);
    return `${kind}-${n}`;
  };
  let open: Open[] = [];
  let pendingLabel: string | undefined;
  let lane: string | undefined;
  const lanes = new Map<string, string>();
  const parents: string[] = [];
  let last: string | undefined;
  const loops: { exits: Open[] }[] = [];
  let title: string | undefined;

  const connect = (targets: Open[], to: string) => {
    for (const o of targets) {
      const label = [o.label, pendingLabel].filter(Boolean).join(" ") || undefined;
      edges.push({ from: o.from, to, kind: "flow", label });
    }
    pendingLabel = undefined;
  };
  const add = (kind: IrNode["kind"], label: string, extra: Partial<IrNode> = {}): string => {
    const id = nextId(extra.classifier ?? kind);
    nodes.push({ id, kind, label, parent: parents.at(-1) ?? lane, ...extra });
    connect(open, id);
    open = [{ from: id }];
    last = id;
    return id;
  };
  const branchLabels = (node: Node) => node.namedChildren.filter((c) => c.type === "branch_label");
  const fieldLabel = (node: Node) => {
    const l = node.childForFieldName("label");
    return l ? paren(l.text) || undefined : undefined;
  };
  const statementsOf = (node: Node) => node.namedChildren.filter((c) => !["condition", "branch_label", "action_text", "identifier", "string", "color", "fork_label", "lane_text"].includes(c.type));

  const visit = (node: Node): void => {
    switch (node.type) {
      case "diagram": {
        const name = node.childForFieldName("name");
        if (name) title = name.text.trim();
        for (const c of node.namedChildren) visit(c);
        return;
      }
      case "activity_control": {
        const word = node.text.trim().split(/\s+/)[0];
        if (word === "start") add("start", "");
        else if (word === "stop" || word === "end") {
          add("end", "", { classifier: word });
          open = [];
        } else if (word === "kill" || word === "detach") open = [];
        else if (word === "break" && loops.length) {
          loops[loops.length - 1].exits.push(...open);
          open = [];
        }
        return;
      }
      case "activity_action": {
        const text = node.childForFieldName("text")?.text ?? node.text;
        add("action", actionText(text));
        return;
      }
      case "activity_arrow": {
        const l = node.childForFieldName("label")?.text.replace(/;\s*$/, "").trim();
        if (l) pendingLabel = l;
        return;
      }
      case "if_block": {
        const decision = add("decision", paren(node.childForFieldName("condition")?.text));
        const ends: Open[] = [];
        open = [{ from: decision, label: fieldLabel(node) }];
        for (const c of node.namedChildren) {
          if (c.type === "elseif_clause" || c.type === "else_clause") continue;
          if (c.type === "condition" || c.type === "branch_label") continue;
          visit(c);
        }
        ends.push(...open);
        let previous = decision;
        let elseTaken = false;
        for (const c of node.namedChildren) {
          if (c.type === "elseif_clause") {
            open = [{ from: previous }];
            const d = add("decision", paren(c.childForFieldName("condition")?.text));
            open = [{ from: d, label: fieldLabel(c) }];
            for (const s of statementsOf(c)) visit(s);
            ends.push(...open);
            previous = d;
          } else if (c.type === "else_clause") {
            open = [{ from: previous, label: fieldLabel(c) }];
            for (const s of statementsOf(c)) visit(s);
            ends.push(...open);
            elseTaken = true;
          }
        }
        if (!elseTaken) ends.push({ from: previous });
        open = ends;
        return;
      }
      case "switch_block": {
        const decision = add("decision", paren(node.childForFieldName("condition")?.text));
        const ends: Open[] = [];
        for (const c of node.namedChildren) {
          if (c.type !== "case_clause") continue;
          open = [{ from: decision, label: paren(c.childForFieldName("condition")?.text) || undefined }];
          for (const s of statementsOf(c)) visit(s);
          ends.push(...open);
        }
        open = ends;
        return;
      }
      case "while_block": {
        const decision = add("decision", paren(node.childForFieldName("condition")?.text));
        const labels = branchLabels(node);
        const again = fieldLabel(node);
        const exit = labels.filter((l) => l !== node.childForFieldName("label")).map((l) => paren(l.text)).pop();
        loops.push({ exits: [] });
        open = [{ from: decision, label: again }];
        for (const s of statementsOf(node)) visit(s);
        connect(open, decision);
        open = [{ from: decision, label: exit }, ...loops.pop()!.exits];
        return;
      }
      case "repeat_block": {
        const first = nodes.length;
        loops.push({ exits: [] });
        const init = node.childForFieldName("action");
        if (init) add("action", actionText(init.text));
        const body = statementsOf(node).filter((s) => !(s.type === "activity_action" && s.childForFieldName("direction")));
        const backward = statementsOf(node).filter((s) => s.type === "activity_action" && s.childForFieldName("direction"));
        for (const s of body) visit(s);
        const entry = nodes[first]?.id;
        const decision = add("decision", paren(node.childForFieldName("condition")?.text));
        const labels = branchLabels(node);
        const again = fieldLabel(node);
        const exit = labels.filter((l) => l !== node.childForFieldName("label")).map((l) => paren(l.text)).pop();
        open = [{ from: decision, label: again }];
        for (const s of backward) visit(s);
        if (entry) connect(open, entry);
        open = [{ from: decision, label: exit }, ...loops.pop()!.exits];
        return;
      }
      case "fork_block": {
        const fork = add("bar", "", { classifier: "fork" });
        const branches: Node[][] = [[]];
        for (const c of node.namedChildren) {
          if (c.type === "fork_again") branches.push(statementsOf(c));
          else if (c.type !== "fork_label") branches[0].push(c);
        }
        const ends: Open[] = [];
        for (const branch of branches) {
          open = [{ from: fork }];
          for (const s of branch) visit(s);
          ends.push(...open);
        }
        open = ends;
        if (!/end\s+merge\s*$/.test(node.text.trim())) add("bar", "", { classifier: "join" });
        return;
      }
      case "split_block": {
        const base = open;
        const branches: Node[][] = [[]];
        for (const c of node.namedChildren) {
          if (c.type === "split_again") branches.push(statementsOf(c));
          else branches[0].push(c);
        }
        const ends: Open[] = [];
        for (const branch of branches) {
          open = base;
          for (const s of branch) visit(s);
          ends.push(...open);
        }
        open = ends;
        return;
      }
      case "partition_block": {
        const name = node.childForFieldName("name")?.text.replace(/^"|"$/g, "") ?? "partition";
        const id = nextId("partition");
        nodes.push({ id, kind: "container", label: name, classifier: "partition", parent: parents.at(-1) ?? lane });
        parents.push(id);
        for (const s of statementsOf(node)) visit(s);
        parents.pop();
        return;
      }
      case "swimlane": {
        const text = node.childForFieldName("name")?.text ?? node.text;
        const name = text.split("|").filter((s) => s.trim() && !s.trim().startsWith("#")).pop()?.trim() ?? "lane";
        let id = lanes.get(name);
        if (!id) {
          id = nextId("lane");
          lanes.set(name, id);
          nodes.push({ id, kind: "container", label: name, classifier: "swimlane" });
        }
        lane = id;
        return;
      }
      case "note_statement": {
        const text = node.childForFieldName("text")?.text.trim();
        const body = node.namedChildren.filter((c) => c.type === "raw_line").map((c) => c.text.trim());
        const id = nextId("note");
        nodes.push({ id, kind: "note", label: text ?? body[0] ?? "note", sections: body.length > 1 ? [body.slice(1)] : undefined, parent: parents.at(-1) ?? lane });
        if (last) edges.push({ from: id, to: last, kind: "attachment" });
        return;
      }
      default:
        return;
    }
  };

  visit(root.namedChildren.find((c) => c.type === "diagram") ?? root);
  return { ir: 1, title, nodes, edges };
}
