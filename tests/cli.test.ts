import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { main } from "../src/render/cli.js";

describe("cli", () => {
  it("renders puml files and prebuilt IR documents", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pr-"));
    const puml = join(dir, "d.puml");
    writeFileSync(puml, "@startuml\nclass Foo\n@enduml\n");
    const out = join(dir, "d.svg");
    expect(await main([puml, "-o", out])).toBe(0);
    expect(readFileSync(out, "utf8")).toContain('id="Foo"');

    const irFile = join(dir, "d.json");
    writeFileSync(
      irFile,
      JSON.stringify({ ir: 1, nodes: [{ id: "a", kind: "box", label: "A" }], edges: [] }),
    );
    const out2 = join(dir, "ir.svg");
    expect(await main(["--ir", irFile, "-o", out2])).toBe(0);
    expect(readFileSync(out2, "utf8")).toContain('id="a"');
  });

  it("fails usage without input", async () => {
    expect(await main([])).toBe(2);
  });
});
