// Build-time codegen from the normative JSON Schema:
//  - schema.gen.ts: the schema as a const (no fs at runtime)
//  - validate.gen.js: a STANDALONE precompiled Ajv validator — plain
//    functions, no `new Function` at runtime, so the engine can run
//    under a CSP without 'unsafe-eval' (vscode webviews).
import { readFileSync, writeFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";

const schemaText = readFileSync(
  new URL("../schema/render-ir.schema.json", import.meta.url),
  "utf8",
);
writeFileSync(
  new URL("../src/render/schema.gen.ts", import.meta.url),
  "// GENERATED from schema/render-ir.schema.json — do not edit.\n" +
    `export const RENDER_IR_SCHEMA = ${schemaText.trim()} as const;\n`,
);

const ajv = new Ajv2020({ allErrors: true, code: { source: true, esm: true } });
const validate = ajv.compile(JSON.parse(schemaText));
let code = standaloneCode(ajv, validate);
// Inline ajv's ucs2length runtime helper so the module is dependency-free
// and require()-free (ESM + browser + CSP safe). The helper's local name
// (funcN) shifts as the schema grows, so match it, don't hardcode it.
const UCS2 =
  "(function(str){const len=str.length;let length=0,pos=0,value;while(pos<len){length++;value=str.charCodeAt(pos++);if(value>=0xD800&&value<=0xDBFF&&pos<len){value=str.charCodeAt(pos);if((value&0xFC00)===0xDC00)pos++;}}return length;})";
code = code.replace(
  /const (\w+) = require\("ajv\/dist\/runtime\/ucs2length"\)\.default;/g,
  (_, name) => `const ${name} = ${UCS2};`,
);
if (code.includes("require(")) {
  console.error("validator codegen still contains require() — extend the inliner");
  process.exit(1);
}
writeFileSync(
  new URL("../src/render/validate.gen.js", import.meta.url),
  "// GENERATED standalone validator — do not edit.\n" + code,
);
writeFileSync(
  new URL("../src/render/validate.gen.d.ts", import.meta.url),
  `// GENERATED — do not edit.
import type { ErrorObject } from "ajv";
declare const validate: {
  (data: unknown): boolean;
  errors?: ErrorObject[] | null;
};
export default validate;
`,
);
console.log("schema.gen.ts + validate.gen.js written");
