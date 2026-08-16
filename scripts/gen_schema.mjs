// Generates src/render/schema.gen.ts from the normative JSON Schema so the
// engine needs no filesystem at runtime (browser/webview safe).
import { readFileSync, writeFileSync } from "node:fs";
const schema = readFileSync(new URL("../schema/render-ir.schema.json", import.meta.url), "utf8");
writeFileSync(
  new URL("../src/render/schema.gen.ts", import.meta.url),
  "// GENERATED from schema/render-ir.schema.json — do not edit.\n" +
    `export const RENDER_IR_SCHEMA = ${schema.trim()} as const;\n`,
);
console.log("schema.gen.ts written");
