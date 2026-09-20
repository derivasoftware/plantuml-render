/**
 * PlantUML frontend core: tree-sitter CST → render-IR (class subset).
 *
 * Environment-neutral: works over any structurally tree-sitter-shaped
 * node (node binding or web-tree-sitter). Anything outside the class
 * subset (raw frontier, display directives, sequence constructs) is
 * simply not drawn — the IR carries what the subset expresses.
 */

import { type IrEdge, type IrNode, type RenderIr } from "./ir.js";

/** Structural view of a tree-sitter node — satisfied by both the node
 * binding and web-tree-sitter, so one mapping serves CLI and webview. */
export interface CstNode {
  type: string;
  text: string;
  children: CstNode[];
  namedChildren: CstNode[];
  childForFieldName(name: string): CstNode | null;
}

type Node = CstNode;

/** Structural decode of a relation operator: head/tail decorations on a
 * dashed or dotted core, direction hints stripped. Reversed forms
 * (`B <|-- A` ≡ `A --|> B`) swap the endpoints so the stored edge is
 * canonical. Plain links (`--`, `..`) draw as associations. */
function decodeOperator(
  op: string,
): { kind: IrEdge["kind"]; swapped: boolean } | null {
  const m = /^(<\||<|\*|o)?([-.]+(?:(?:left|right|up|down)[-.]+)?)(\|>|>|\*|o)?$/.exec(
    op,
  );
  if (!m) return null;
  const [, head, core, tail] = m;
  const dotted = core.includes(".");
  if (tail === "|>") return { kind: dotted ? "realization" : "inheritance", swapped: false };
  if (head === "<|") return { kind: dotted ? "realization" : "inheritance", swapped: true };
  if (head === "*") return { kind: "composition", swapped: false };
  if (tail === "*") return { kind: "composition", swapped: true };
  if (head === "o") return { kind: "aggregation", swapped: false };
  if (tail === "o") return { kind: "aggregation", swapped: true };
  if (tail === ">") return { kind: dotted ? "dependency" : "association", swapped: false };
  if (head === "<") return { kind: dotted ? "dependency" : "association", swapped: true };
  return { kind: "association", swapped: false };
}

/** A diagram is a sequence diagram when it declares participants or
 * frames — the same inference PlantUML itself makes. */
function isSequence(root: Node): boolean {
  const walk = (node: Node): boolean => {
    if (node.type === "participant_declaration" || node.type === "frame_block") {
      return true;
    }
    if (node.type === "entity_body") return false;
    return node.namedChildren.some(walk);
  };
  return walk(root);
}

const PARTICIPANT_KINDS = new Set([
  "participant", "actor", "boundary", "control", "entity",
  "database", "collections", "queue",
]);

/** Sequence mapping: statements claim rows in source order — messages,
 * `==` dividers and anchored notes each take one; frames span the rows
 * of their children (an empty frame still claims one). */
function sequenceToIr(root: Node): RenderIr {
  const nodes: IrNode[] = [];
  const edges: IrEdge[] = [];
  const lifelineIds = new Map<string, string>();
  let title: string | undefined;
  let order = 0;
  let frameCounter = 0;
  let noteCounter = 0;
  let dividerCounter = 0;

  const strip = (s: string) => s.replace(/^"|"$/g, "");

  const ensureLifeline = (name: string, classifier?: string): string => {
    const existing = lifelineIds.get(name);
    if (existing) return existing;
    lifelineIds.set(name, name);
    nodes.push({
      id: name,
      kind: "lifeline",
      label: name,
      classifier: classifier ?? "participant",
    });
    return name;
  };

  const visit = (node: Node) => {
    switch (node.type) {
      case "diagram": {
        const name = node.childForFieldName("name");
        if (name) title = name.text.trim();
        break;
      }
      case "participant_declaration": {
        const kind = node.childForFieldName("kind")?.text ?? "participant";
        const name = strip(node.childForFieldName("name")?.text ?? "?");
        const alias = node.childForFieldName("alias");
        const id = alias ? strip(alias.text) : name;
        if (!lifelineIds.has(id)) {
          lifelineIds.set(id, id);
          lifelineIds.set(name, id);
          nodes.push({ id, kind: "lifeline", label: name, classifier: kind });
        }
        return;
      }
      case "relation": {
        const op = node.childForFieldName("operator")?.text.trim() ?? "";
        const core = op.replace(/\[[^\]]*\]/g, "");
        const reversed = core.startsWith("<");
        const left = strip(node.childForFieldName("left")?.text ?? "");
        const right = strip(node.childForFieldName("right")?.text ?? "");
        const from = ensureLifeline(
          lifelineIds.get(reversed ? right : left) ?? (reversed ? right : left),
        );
        const to = ensureLifeline(
          lifelineIds.get(reversed ? left : right) ?? (reversed ? left : right),
        );
        edges.push({
          from,
          to,
          kind: "message",
          label: node.childForFieldName("label")?.text.trim(),
          order: order++,
          dashed: /--|\.\./.test(core) || undefined,
        });
        return;
      }
      case "frame_block": {
        const kind = node.childForFieldName("kind")?.text ?? "group";
        const label = node.childForFieldName("label")?.text.trim();
        const frame: IrNode = {
          id: `frame-${++frameCounter}`,
          kind: "frame",
          label: label ? `${kind} ${label}` : kind,
          span: [order, order],
        };
        nodes.push(frame);
        const start = order;
        const dividers: { at: number; label: string }[] = [];
        for (const child of node.namedChildren) {
          if (child.type === "else_clause") {
            dividers.push({
              at: order,
              label: child.childForFieldName("label")?.text.trim() ?? "else",
            });
            for (const inner of child.namedChildren) visit(inner);
          } else {
            visit(child);
          }
        }
        if (order === start) order++; // an empty frame still shows
        frame.span = [start, order - 1];
        if (dividers.length > 0) frame.dividers = dividers;
        return;
      }
      case "divider": {
        const label = node.text.replace(/=+/g, "").trim();
        nodes.push({
          id: `divider-${++dividerCounter}`,
          kind: "divider",
          label,
          at: order++,
        });
        return;
      }
      case "note_statement": {
        const text = node.childForFieldName("text")?.text.trim();
        const body = node.namedChildren
          .filter((c) => c.type === "raw_line")
          .map((c) => c.text.trim());
        const target = node.childForFieldName("target");
        const anchorName = target
          ? strip(target.text.split(",")[0].trim())
          : undefined;
        nodes.push({
          id: `note-${++noteCounter}`,
          kind: "note",
          label: text ?? (body.length > 0 ? body.join("\n") : "note"),
          classifier: node.childForFieldName("position")?.text ?? "right",
          anchor: anchorName
            ? ensureLifeline(lifelineIds.get(anchorName) ?? anchorName)
            : undefined,
          at: order++,
        });
        return;
      }
    }
    for (const child of node.namedChildren) visit(child);
  };

  visit(root);
  return { ir: 1, title, nodes, edges };
}

/** Diagram kinds the frontend recognises but does not map (REQ-00021-1).
 * The grammar keeps their statements as raw lines (or activity nodes), so
 * the kind is read from those and the IR carries a notice instead of an
 * empty drawing. Note bodies and entity bodies are not scanned. */
const START_TAGS: Record<string, string> = {
  mindmap: "mindmap", gantt: "gantt", wbs: "work breakdown", json: "JSON", yaml: "YAML",
  salt: "salt wireframe", ditaa: "ditaa", dot: "dot", chronology: "chronology", regex: "regex",
};
const RAW_LINE_KINDS: [RegExp, string][] = [
  [/^(start|stop|fork|end ?fork|while|endwhile|repeat|endif|split|end ?split|detach|kill|backward)\b/, "activity"],
  [/^if\s*\(/, "activity"],
  [/^(\[\*\]|state\b)/, "state"],
  [/^usecase\b/, "use case"],
  [/^(component|artifact)\b/, "component"],
  [/^(node|cloud|storage|hexagon)\b/, "deployment"],
];

function notDrawnKind(root: Node): string | undefined {
  const tag = /@start(\w+)/.exec(root.text)?.[1];
  if (tag && tag !== "uml") return START_TAGS[tag] ?? tag;
  let found: string | undefined;
  const walk = (node: Node): void => {
    if (found) return;
    if (node.type === "activity_action" || node.type === "swimlane") {
      found = "activity";
      return;
    }
    if (node.type === "raw_line") {
      const line = node.text.trim();
      found = RAW_LINE_KINDS.find(([re]) => re.test(line))?.[1];
      return;
    }
    if (node.type === "ERROR" && /\[\*\]/.test(node.text)) {
      found = "state";
      return;
    }
    if (node.type === "note_statement" || node.type === "entity_body") return;
    for (const child of node.namedChildren) walk(child);
  };
  walk(root);
  return found;
}

/** The notice for a kind that is not drawn: the SVG says so instead of
 * leaving a blank, and the command line repeats it on stderr. */
export function notDrawnNotice(kind: string): string {
  const name = kind.charAt(0).toUpperCase() + kind.slice(1);
  return `${name} diagram: not drawn by plantuml-render (kept lossless).\nRender this kind with plantuml.jar.`;
}

function diagramTitle(root: Node): string | undefined {
  const diagram = root.namedChildren.find((c) => c.type === "diagram");
  return diagram?.childForFieldName("name")?.text.trim() || undefined;
}

export function treeToIr(root: CstNode): RenderIr {
  const kind = notDrawnKind(root);
  if (kind) return { ir: 1, title: diagramTitle(root), nodes: [], edges: [], notice: notDrawnNotice(kind) };
  if (isSequence(root)) return sequenceToIr(root);
  const nodes: IrNode[] = [];
  const edges: IrEdge[] = [];
  const nodeIds = new Set<string>();
  const shortToId = new Map<string, string>();
  const pushNode = (node: IrNode): boolean => {
    // Same-named namespaces reopen the same namespace in PlantUML, and a
    // re-declared entity is the same entity: merge by id, first wins.
    if (nodeIds.has(node.id)) return false;
    nodeIds.add(node.id);
    nodes.push(node);
    return true;
  };
  let title: string | undefined;
  let noteCounter = 0;

  const strip = (s: string) => s.replace(/^"|"$/g, "");

  const entityName = (decl: Node): string => {
    const alias = decl.childForFieldName("alias");
    const name = decl.childForFieldName("name");
    return strip((alias ?? name)?.text ?? "?");
  };

  const visit = (node: Node, containerId: string | undefined) => {
    switch (node.type) {
      case "diagram": {
        const name = node.childForFieldName("name");
        if (name) title = name.text.trim();
        break;
      }
      case "namespace_block":
      case "package_block": {
        const nameNode = node.childForFieldName("name");
        const label = strip(nameNode?.text ?? "");
        // Dotted names open one container per segment: argos.toolkit.x
        // and argos.toolkit.y share the argos.toolkit box.
        let id = containerId;
        for (const segment of label.split(".")) {
          const segmentId = id ? `${id}.${segment}` : segment;
          pushNode({
            id: segmentId,
            kind: "container",
            label: segment,
            classifier: node.type === "package_block" ? "package" : "namespace",
            parent: id || undefined,
          });
          id = segmentId;
        }
        for (const child of node.namedChildren) visit(child, id);
        return;
      }
      case "class_declaration":
      case "interface_declaration":
      case "enum_declaration": {
        const label = entityName(node);
        const id = containerId ? `${containerId}.${label}` : label;
        shortToId.set(label, id);
        const stereotypeNode = node.childForFieldName("stereotype");
        pushNode({
          id,
          kind: "box",
          label,
          classifier: node.type.replace("_declaration", ""),
          abstract: node.children.some((c) => c.type === "abstract") || undefined,
          stereotype: stereotypeNode
            ? stereotypeNode.text.replace(/^<<|>>$/g, "").trim()
            : undefined,
          sections: memberSections(node),
          parent: containerId,
        });
        return;
      }
      case "relation": {
        const op = node.childForFieldName("operator")?.text.trim() ?? "";
        const decoded = decodeOperator(op);
        if (decoded) {
          const label = node.childForFieldName("label")?.text.trim();
          const left = strip(node.childForFieldName("left")?.text ?? "");
          const right = strip(node.childForFieldName("right")?.text ?? "");
          edges.push({
            from: decoded.swapped ? right : left,
            to: decoded.swapped ? left : right,
            kind: decoded.kind,
            label,
          });
        }
        return;
      }
      case "note_statement": {
        const text = node.childForFieldName("text")?.text.trim();
        const body = node.namedChildren
          .filter((c) => c.type === "raw_line")
          .map((c) => c.text.trim());
        const id = `note-${++noteCounter}`;
        pushNode({
          id,
          kind: "note",
          label: text ?? body[0] ?? "note",
          sections: body.length > 1 ? [body.slice(1)] : undefined,
          parent: containerId,
        });
        const target = node.childForFieldName("target");
        if (target) {
          edges.push({ from: id, to: strip(target.text), kind: "attachment" });
        }
        return;
      }
    }
    for (const child of node.namedChildren) visit(child, containerId);
  };

  visit(root, undefined);

  // Relation endpoints reference short names; requalify to placed ids.
  for (const edge of edges) {
    edge.from = shortToId.get(edge.from) ?? edge.from;
    edge.to = shortToId.get(edge.to) ?? edge.to;
  }

  // Relations alone draw nothing (the engine drops edges without both
  // ends); say so rather than hand back an empty frame (REQ-00021-1).
  if (nodes.length === 0 && edges.length > 0) {
    const n = edges.length;
    const notice = `Nothing drawn: ${n} relation${n === 1 ? "" : "s"} reference entities that are not declared in this diagram.`;
    return { ir: 1, title, nodes, edges, notice };
  }
  return { ir: 1, title, nodes, edges };
}

function memberSections(decl: Node): string[][] | undefined {
  const body = decl.childForFieldName("body");
  if (!body) return undefined;
  const attrs: string[] = [];
  const methods: string[] = [];
  for (const member of body.namedChildren) {
    if (member.type !== "member") continue;
    const text = member.text.trim();
    const isMethod = member.namedChildren.some((c) => c.type === "method");
    (isMethod ? methods : attrs).push(text);
  }
  const sections = [attrs, methods].filter((s) => s.length > 0);
  return sections.length > 0 ? sections : undefined;
}
