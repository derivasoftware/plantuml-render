/**
 * State frontend (spike PUML-74): tree-sitter CST of a state diagram →
 * render-IR. The spike showed the drawing was already there — the
 * vocabulary the activity work added covers a state machine — so this is
 * a walk and a mapping, not a new way to draw.
 *
 * A state is an `action`, a composite is a `container`, `[*]` is a `start`
 * at the top of its level and an `end` wherever a transition arrives at
 * one, and a transition is a `flow` edge whose label is the trigger, the
 * guard and the action as written.
 *
 * What is not drawn as its own shape says so in the notice rather than
 * disappearing: concurrent regions, history, and the pseudostates that
 * have a shape of their own in the standard (fork and join bars, the
 * choice diamond, entry and exit points).
 */

import type { CstNode } from "./frontend-core.js";
import { type IrEdge, type IrNode, type RenderIr } from "./ir.js";

type Node = CstNode;

/** The stereotypes the standard draws as a shape, which this does not. */
const SHAPED = new Set(["choice", "fork", "join", "entrypoint", "exitpoint", "inputpin", "outputpin", "expansioninput", "expansionoutput"]);

/** A diagram is a state diagram when a state or a pseudostate is in its tree. */
export function isState(root: Node): boolean {
  const walk = (node: Node): boolean => {
    if (node.type === "state_block" || node.type === "pseudostate") return true;
    if (node.type === "entity_body" || node.type === "note_statement") return false;
    return node.namedChildren.some(walk);
  };
  return walk(root);
}

const strip = (text: string) => text.replace(/^"|"$/g, "");

/** `[[url{explanation}]]` on a state or a transition. */
function link(node: Node | null): { href?: string; title?: string } {
  if (!node) return {};
  const m = /^\[\[\s*([^\]{}\s][^\]{}]*?)?\s*(?:\{([^}]*)\})?\s*\]\]$/.exec(node.text.trim());
  if (!m || (!m[1] && !m[2])) return {};
  return { ...(m[1] ? { href: m[1] } : {}), ...(m[2]?.trim() ? { title: m[2].trim() } : {}) };
}

export function stateToIr(root: Node): RenderIr {
  const nodes: IrNode[] = [];
  const edges: IrEdge[] = [];
  const byId = new Map<string, IrNode>();
  const shortToId = new Map<string, string>();
  /** The terminals of each level, made once and shared by every arrow. */
  const terminals = new Map<string, string>();
  const dropped = new Set<string>();
  let title: string | undefined;

  const push = (node: IrNode): IrNode => {
    const already = byId.get(node.id);
    if (already) return already;
    byId.set(node.id, node);
    nodes.push(node);
    return node;
  };

  /** `[*]` is a start where a transition leaves it and an end where one
   * arrives, so each level has at most one of each, made on demand. */
  const terminal = (level: string | undefined, kind: "start" | "end"): string => {
    const key = `${level ?? ""}\u0000${kind}`;
    const made = terminals.get(key);
    if (made) return made;
    const id = `${level ? `${level}.` : ""}\u0000${kind}`;
    terminals.set(key, id);
    push({ id, kind, label: "", ...(level ? { parent: level } : {}) });
    return id;
  };

  /** One end of a transition: a state by name, or a terminal of this level. */
  const endpoint = (node: Node | null, level: string | undefined, side: "from" | "to"): string => {
    const text = strip(node?.text ?? "");
    if (node?.type === "pseudostate") {
      if (/^\[\*\]$/.test(text)) return terminal(level, side === "from" ? "start" : "end");
      // History has a shape of its own in the standard and not here: drawn
      // as a state so the wire survives, and said in the notice.
      dropped.add("history");
      const id = `${level ? `${level}.` : ""}${text}`;
      push({ id, kind: "action", label: text, ...(level ? { parent: level } : {}) });
      return id;
    }
    // A state is declared by being used: `Idle --> Running` names two of
    // them whether or not a `state` line ever said so.
    const known = shortToId.get(text);
    if (known) return known;
    const id = level ? `${level}.${text}` : text;
    shortToId.set(text, id);
    push({ id, kind: "action", label: text, ...(level ? { parent: level } : {}) });
    return id;
  };

  const visit = (node: Node, level: string | undefined): void => {
    switch (node.type) {
      case "diagram": {
        const name = node.childForFieldName("name");
        if (name) title = name.text.trim();
        break;
      }
      case "state_block": {
        // `state "A long name" as X`: the long name is what the diagram
        // shows and `X` is what the transitions write, which is the whole
        // reason the form exists.
        const declared = strip(node.childForFieldName("name")?.text ?? "?");
        const alias = node.childForFieldName("alias");
        const handle = alias ? strip(alias.text) : declared;
        const label = declared;
        const id = level ? `${level}.${handle}` : handle;
        shortToId.set(handle, id);
        shortToId.set(declared, id);
        const stereo = node.childForFieldName("stereotype")?.text.replace(/^<<|>>$/g, "").trim();
        if (stereo && SHAPED.has(stereo.toLowerCase())) dropped.add("pseudostate shapes");
        const described = node.childForFieldName("description")?.text.trim();
        const body = node.namedChildren.some((c) => c.type !== "stereotype" && c.type !== "color" && c.type !== "identifier" && c.type !== "string" && c.type !== "label");
        // A state may have been made already by a transition that named it;
        // the declaration is what it says about itself, so it wins.
        const state = push({ id, kind: body ? "container" : "action", label, ...(level ? { parent: level } : {}) });
        if (body) state.kind = "container";
        if (stereo) state.stereotype = stereo;
        if (described) state.title = state.title ? `${state.title}\n${described}` : described;
        for (const child of node.namedChildren) visit(child, id);
        return;
      }
      case "colon_member": {
        // `Idle : a line`, the chapter's way of describing a state after
        // declaring it. Every line adds to what the state says.
        const target = shortToId.get(strip(node.childForFieldName("entity")?.text ?? ""));
        const said = node.childForFieldName("member")?.text.trim();
        const state = target ? byId.get(target) : undefined;
        if (state && said) state.title = state.title ? `${state.title}\n${said}` : said;
        return;
      }
      case "relation": {
        const from = endpoint(node.childForFieldName("left"), level, "from");
        const to = endpoint(node.childForFieldName("right"), level, "to");
        const written = node.childForFieldName("label")?.text.trim();
        const tail = written ? /\s*(\[\[[^\]]*\]\])$/.exec(written) : null;
        const inLabel = tail ? link({ text: tail[1] } as Node) : {};
        edges.push({
          from,
          to,
          kind: "flow",
          ...(tail ? { label: written!.slice(0, tail.index).trim() || undefined } : { label: written }),
          ...link(node.childForFieldName("link")),
          ...inLabel,
        });
        return;
      }
      case "raw_line":
        if (/^--+$/.test(node.text.trim())) dropped.add("concurrent regions");
        return;
      case "note_statement":
        dropped.add("notes");
        return;
      default:
        break;
    }
    for (const child of node.namedChildren) visit(child, level);
  };

  visit(root, undefined);

  const notice = dropped.size
    ? `Drawn as plain states, not as their own shapes: ${[...dropped].sort().join(", ")}.`
    : undefined;
  return { ir: 1, title, nodes, edges, ...(notice ? { notice } : {}) };
}
