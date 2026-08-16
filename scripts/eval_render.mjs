// Wild-corpus robustness: render every .puml under the given roots.
// Pass criteria per file: no throw, well-formed SVG root, deterministic
// (two renders byte-identical). Usage: node scripts/eval_render.mjs <root>...

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { renderSvg } from "../out/render/engine.js";
import { pumlToIr } from "../out/render/frontend.js";

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".venv" || name === ".git") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (name.endsWith(".puml")) yield p;
  }
}

const roots = process.argv.slice(2);
let total = 0;
let failed = 0;
const signatures = new Map();

for (const root of roots) {
  for (const file of walk(root)) {
    total += 1;
    try {
      const src = readFileSync(file, "utf8");
      const a = renderSvg(await pumlToIr(src));
      const b = renderSvg(await pumlToIr(src));
      if (a !== b) throw new Error("non-deterministic output");
      if (!a.startsWith("<svg ") || !a.endsWith("</svg>")) {
        throw new Error("malformed svg envelope");
      }
    } catch (err) {
      failed += 1;
      const key = String(err.message).slice(0, 60);
      if (!signatures.has(key)) signatures.set(key, file);
      if (failed <= 5) console.error("FAIL:", file, "→", err.message);
    }
  }
}

console.log(`files: ${total}  ok: ${total - failed}  failed: ${failed}`);
for (const [msg, file] of [...signatures].slice(0, 10)) {
  console.log(`  ${msg}  e.g. ${file}`);
}
process.exit(failed === 0 ? 0 : 1);
