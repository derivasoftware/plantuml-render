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

const EDGE_BY_OP: Record<string, IrEdge["kind"]> = {
  "--|>": "inheritance",
  "..|>": "realization",
  "*--": "composition",
  "o--": "aggregation",
  "..>": "dependency",
  "-->": "association",
};

export function treeToIr(root: CstNode): RenderIr {
  const nodes: IrNode[] = [];
  const edges: IrEdge[] = [];
  const shortToId = new Map<string, string>();
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
        const id = containerId ? `${containerId}.${label}` : label;
        nodes.push({
          id,
          kind: "container",
          label,
          classifier: node.type === "package_block" ? "package" : "namespace",
          parent: containerId,
        });
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
        nodes.push({
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
        const kind = EDGE_BY_OP[op];
        if (kind) {
          const label = node.childForFieldName("label")?.text.trim();
          edges.push({
            from: strip(node.childForFieldName("left")?.text ?? ""),
            to: strip(node.childForFieldName("right")?.text ?? ""),
            kind,
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
        nodes.push({
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
