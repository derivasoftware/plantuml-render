#!/usr/bin/env node
/**
 * The command line (REQ-00004-1, REQ-00014-1):
 *
 *   plantuml-render <file.puml> [-o out.svg]        one diagram; SVG to stdout without -o
 *   plantuml-render render <file|dir> [-o out|dir]  a file, or every .puml under a directory
 *   plantuml-render --ir <model.json> [-o out.svg]  draw a render-IR document
 *   plantuml-render serve <file.puml> [--port N]    interactive preview over local HTTP
 *   plantuml-render docs [topic]                    the manual, embedded
 *   plantuml-render --version | --help
 *
 * `--links map.json` and `--link-template <tpl>` decorate entities with
 * links (REQ-00018-1) in every render form.
 *
 * `main` takes its manual and version by injection so the standalone
 * executable (scripts/standalone.mjs) can hand it the embedded copies; the
 * npm install reads them from the package tree.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";

import { renderSvg } from "./engine.js";
import { pumlToIr } from "./frontend.js";
import { applyLinks, type LinkSpec } from "./links.js";
import { expandIncludes, type IncludeLoader } from "./preprocess.js";
import { VERSION } from "./version.gen.js";

export const TOPICS = ["diagrams", "embedding", "navigation", "style", "contract"] as const;

export interface CliDeps {
  docs?: Record<string, string>;
  version?: string;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

const fsLoader: IncludeLoader = {
  read(path) {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return null;
    }
  },
  resolve(base, rel) {
    return resolve(base, rel);
  },
  dirname(path) {
    return dirname(path);
  },
};

const PUML = /\.(puml|plantuml|iuml|wsd)$/;

/** The help screen: usage, options, what the output is, examples. */
export function helpText(version: string): string {
  return `plantuml-render ${version} — deterministic SVG from PlantUML. No Java; one binary.

USAGE
  plantuml-render <file.puml> [-o out.svg]         render one diagram (SVG to stdout without -o)
  plantuml-render render <file|dir> [-o out|dir]   render a file, or every .puml under a directory
  plantuml-render --ir <model.json> [-o out.svg]   draw a render-IR document instead of PlantUML text
  plantuml-render serve <file.puml> [--port N]     interactive preview over local HTTP, reloads on save
  plantuml-render docs [topic]                     the manual (topics: ${TOPICS.join(", ")})
  plantuml-render --version | --help

OPTIONS
  -o, --out <path>          output file, or output directory in batch mode (the source tree is mirrored)
  --links <map.json>        link entities: { "<id or unique name>": "<url>" | { href, title, refs } }
  --link-template <tpl>     href for every entity without one; {id} and {name} expand

OUTPUT
  Inline-ready SVG: styles scoped under .pr-diagram, ids prefixed per diagram, the entity id in
  data-id and data-from/data-to on edges, light and dark palettes inside, natural size that shrinks
  to its container. See \`plantuml-render docs embedding\`.

EXAMPLES
  plantuml-render design/lld/CL_Order.puml -o docs/CL_Order.svg
  plantuml-render render design/ -o site/svg/
  plantuml-render docs navigation
`;
}

function packagedDocs(): Record<string, string> {
  const dir = new URL("../../doc/manual/", import.meta.url);
  const docs: Record<string, string> = {};
  for (const topic of TOPICS) {
    try {
      docs[topic] = readFileSync(new URL(`${topic}.md`, dir), "utf8");
    } catch {
      // a trimmed install without the manual: the topic is simply absent
    }
  }
  return docs;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, acc);
    else if (PUML.test(entry.name)) acc.push(path);
  }
  return acc;
}

async function renderFile(file: string, links: LinkSpec): Promise<string> {
  const raw = readFileSync(file, "utf8");
  const ir = await pumlToIr(await expandIncludes(raw, dirname(resolve(file)), fsLoader));
  ir.title ??= basename(file, extname(file));
  return await renderSvg(applyLinks(ir, links));
}

export async function main(argv: string[], deps: CliDeps = {}): Promise<number> {
  const out = deps.stdout ?? ((text: string) => void process.stdout.write(text));
  const err = deps.stderr ?? ((text: string) => void process.stderr.write(text));
  const version = deps.version ?? VERSION;
  const args = [...argv];
  const takeFlag = (...names: string[]) => {
    const i = args.findIndex((a) => names.includes(a));
    if (i < 0) return false;
    args.splice(i, 1);
    return true;
  };
  const takeValue = (...names: string[]) => {
    const i = args.findIndex((a) => names.includes(a));
    if (i < 0) return undefined;
    const value = args[i + 1];
    args.splice(i, 2);
    return value;
  };

  if (args.length === 0) {
    err(helpText(version));
    return 2;
  }
  if (takeFlag("--help", "-h")) {
    out(helpText(version));
    return 0;
  }
  if (takeFlag("--version", "-V")) {
    out(`${version}\n`);
    return 0;
  }
  if (args[0] === "docs") {
    const docs = deps.docs ?? packagedDocs();
    const topic = args[1];
    if (!topic) {
      out(`Topics: ${TOPICS.join(", ")}\n\n${docs.diagrams ?? ""}`);
      return 0;
    }
    if (!docs[topic]) {
      err(`unknown topic '${topic}'. Topics: ${TOPICS.join(", ")}\n`);
      return 2;
    }
    out(docs[topic]);
    return 0;
  }
  if (args[0] === "serve") {
    args.shift();
    const port = Number(takeValue("--port")) || 0;
    const [file] = args;
    if (!file) {
      err("usage: plantuml-render serve <file.puml> [--port N]\n");
      return 2;
    }
    const { startServer } = await import("./serve.js");
    const serving = await startServer(file, port);
    out(`serving http://127.0.0.1:${serving.port}/ (watching ${file})\n`);
    return new Promise(() => {}); // stay alive until killed
  }

  const irMode = takeFlag("--ir");
  const target = takeValue("-o", "--out");
  const linksFile = takeValue("--links");
  const links: LinkSpec = {
    map: linksFile ? (JSON.parse(readFileSync(linksFile, "utf8")) as LinkSpec["map"]) : undefined,
    template: takeValue("--link-template"),
  };
  if (args[0] === "render") args.shift();
  const [input] = args;
  if (!input) {
    err("usage: plantuml-render [render] <file|dir> [-o out] | --ir <model.json> [-o out] | docs [topic]\n");
    return 2;
  }
  if (!existsSync(input)) {
    err(`no such file or directory: ${input}\n`);
    return 2;
  }
  if (irMode) {
    const svg = await renderSvg(applyLinks(JSON.parse(readFileSync(input, "utf8")), links));
    target ? writeFileSync(target, svg) : out(svg);
    return 0;
  }
  if (statSync(input).isDirectory()) {
    if (!target) {
      err("render <dir> needs -o <dir>\n");
      return 2;
    }
    const files = walk(input);
    let failed = 0;
    for (const file of files) {
      const dest = join(target, relative(input, file)).replace(PUML, ".svg");
      try {
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, await renderFile(file, links));
      } catch (error) {
        failed += 1;
        err(`${file}: ${(error as Error).message}\n`);
      }
    }
    err(`${files.length - failed} of ${files.length} diagrams → ${target}\n`);
    return failed ? 1 : 0;
  }
  const svg = await renderFile(input, links);
  target ? writeFileSync(target, svg) : out(svg);
  return 0;
}

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

// npm bin entries are symlinks: resolve argv[1] before comparing, or
// the guard silently skips main() on global installs.
const invoked = (() => {
  try {
    return process.argv[1] ? pathToFileURL(realpathSync(process.argv[1])).href : undefined;
  } catch {
    return undefined;
  }
})();

if (invoked === import.meta.url) {
  process.exit(await main(process.argv.slice(2)));
}
