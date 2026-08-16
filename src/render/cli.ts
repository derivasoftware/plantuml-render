#!/usr/bin/env node
/**
 * plantuml-render <file.puml> [-o out.svg]   — parse + render
 * plantuml-render --ir <file.json> [-o out]  — render pre-built render-IR
 */

import { readFileSync, writeFileSync } from "node:fs";

import { renderSvg } from "./engine.js";
import { pumlToIr } from "./frontend.js";

export async function main(argv: string[]): Promise<number> {
  const args = [...argv];
  const irMode = args.includes("--ir");
  if (irMode) args.splice(args.indexOf("--ir"), 1);
  let out: string | undefined;
  const oIdx = args.indexOf("-o");
  if (oIdx >= 0) {
    out = args[oIdx + 1];
    args.splice(oIdx, 2);
  }
  const [input] = args;
  if (!input) {
    process.stderr.write(
      "usage: plantuml-render [--ir] <input> [-o out.svg]\n",
    );
    return 2;
  }
  const raw = readFileSync(input, "utf8");
  const ir = irMode ? JSON.parse(raw) : await pumlToIr(raw);
  const svg = renderSvg(ir);
  if (out) {
    writeFileSync(out, svg);
  } else {
    process.stdout.write(svg);
  }
  return 0;
}

import { pathToFileURL } from "node:url";

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exit(await main(process.argv.slice(2)));
}
