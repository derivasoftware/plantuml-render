import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { expandIncludes, type IncludeLoader } from "../../src/render/preprocess.js";

const root = join(__dirname, "..", "..");

const FILES: Record<string, string> = {
  "/d/CL_Leaf.puml": "@startuml CL_Leaf\n!startsub Kernel\nclass Kernel\n!endsub\n@enduml\n",
  "/d/CL_Agg.puml": "@startuml CL_Agg\n!includesub ./CL_Leaf.puml!Kernel\n!include ./missing.iuml\n@enduml\n",
};

const loader: IncludeLoader = {
  read: (path) => FILES[path] ?? null,
  resolve: (base, rel) => `${base}/${rel.replace(/^\.\//, "")}`,
  dirname: (path) => path.slice(0, path.lastIndexOf("/")),
};

describe("include expansion", () => {
  it("expands an aggregate through an injected loader, keeping a missing target's line", async () => {
    const out = await expandIncludes(FILES["/d/CL_Agg.puml"], "/d", loader);
    expect(out).toContain("class Kernel");
    expect(out).toContain("!include ./missing.iuml");
    expect(out).not.toContain("!includesub");
  });

  it("ships as an entry of its own that loads nothing else", () => {
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(manifest.exports["./preprocess"]).toBe("./out/render/preprocess.js");
    const built = readFileSync(join(root, "out/render/preprocess.js"), "utf8");
    expect(built).not.toMatch(/^\s*import\s/m);
  });
});
