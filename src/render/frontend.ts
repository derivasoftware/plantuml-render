/**
 * PlantUML frontend on the wasm grammar (REQ-00013-1): one parser in every
 * host — node, the standalone executable, the browser — so the same source
 * yields the same tree and the same SVG, and no native toolchain is needed
 * to install or run the renderer. The grammar travels as
 * `grammar/tree-sitter-plantuml.wasm`, built from the tag `package.json`
 * pins in `config.grammar` (scripts/build_grammar_wasm.sh).
 */

import { Language, Parser } from "web-tree-sitter";

import { type CstNode, treeToIr } from "./frontend-core.js";
import { type RenderIr } from "./ir.js";

/** The two wasm modules the parser needs, held in memory. */
export interface ParserAssets {
  grammar: Uint8Array;
  runtime: Uint8Array;
}

let assets: ParserAssets | undefined;
let parser: Promise<Parser> | undefined;

/** Point the frontend at parser assets already in memory — the standalone
 * executable embeds them. Without a call, the assets are read from the
 * package tree. */
export function configureParser(next: ParserAssets): void {
  assets = next;
  parser = undefined;
}

async function packagedAssets(): Promise<ParserAssets> {
  const { readFileSync } = await import("node:fs");
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const bytes = (buffer: Uint8Array) => new Uint8Array(buffer);
  return {
    grammar: bytes(readFileSync(new URL("../../grammar/tree-sitter-plantuml.wasm", import.meta.url))),
    runtime: bytes(readFileSync(require.resolve("web-tree-sitter/web-tree-sitter.wasm"))),
  };
}

async function load(): Promise<Parser> {
  const current = assets ?? (assets = await packagedAssets());
  await Parser.init({ wasmBinary: current.runtime } as unknown as Parameters<typeof Parser.init>[0]);
  const instance = new Parser();
  instance.setLanguage(await Language.load(current.grammar));
  return instance;
}

export async function pumlToIr(source: string): Promise<RenderIr> {
  const tree = (await (parser ??= load())).parse(source);
  if (!tree) throw new Error("the parser returned no tree");
  return treeToIr(tree.rootNode as unknown as CstNode);
}
