/**
 * Node-side PlantUML frontend: parses with the native binding and maps
 * through the environment-neutral core.
 */

import Parser from "tree-sitter";

import { type CstNode, treeToIr } from "./frontend-core.js";
import { type RenderIr } from "./ir.js";

let parser: Parser | undefined;

async function getParser(): Promise<Parser> {
  if (!parser) {
    const grammar = await import("tree-sitter-plantuml");
    parser = new Parser();
    parser.setLanguage(
      (grammar.default ?? grammar) as unknown as Parser.Language,
    );
  }
  return parser;
}

export async function pumlToIr(source: string): Promise<RenderIr> {
  const tree = (await getParser()).parse(source);
  return treeToIr(tree.rootNode as unknown as CstNode);
}
