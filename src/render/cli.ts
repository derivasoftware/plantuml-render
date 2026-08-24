#!/usr/bin/env node
/**
 * plantuml-render <file.puml> [-o out.svg]   — parse + render
 * plantuml-render --ir <file.json> [-o out]  — render pre-built render-IR
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { renderSvg } from "./engine.js";
import { pumlToIr } from "./frontend.js";
import { expandIncludes, type IncludeLoader } from "./preprocess.js";

const fsLoader: IncludeLoader = {
  read(path) {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return null;
    }
  },
  resolve(base, relative) {
    return resolve(base, relative);
  },
  dirname(path) {
    return dirname(path);
  },
};

export async function main(argv: string[]): Promise<number> {
  const args = [...argv];
  if (args[0] === "serve") {
    args.shift();
    let port = 0;
    const pIdx = args.indexOf("--port");
    if (pIdx >= 0) {
      port = Number(args[pIdx + 1]) || 0;
      args.splice(pIdx, 2);
    }
    const [file] = args;
    if (!file) {
      process.stderr.write("usage: plantuml-render serve <file.puml> [--port N]\n");
      return 2;
    }
    const { startServer } = await import("./serve.js");
    const serving = await startServer(file, port);
    process.stdout.write(
      `serving http://127.0.0.1:${serving.port}/ (watching ${file})\n`,
    );
    return new Promise(() => {}); // stay alive until killed
  }
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
  const ir = irMode
    ? JSON.parse(raw)
    : await pumlToIr(
        await expandIncludes(raw, dirname(resolve(input)), fsLoader),
      );
  const svg = renderSvg(ir);
  if (out) {
    writeFileSync(out, svg);
  } else {
    process.stdout.write(svg);
  }
  return 0;
}

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

// npm bin entries are symlinks: resolve argv[1] before comparing, or
// the guard silently skips main() on global installs.
const invoked = (() => {
  try {
    return process.argv[1]
      ? pathToFileURL(realpathSync(process.argv[1])).href
      : undefined;
  } catch {
    return undefined;
  }
})();

if (invoked === import.meta.url) {
  process.exit(await main(process.argv.slice(2)));
}
