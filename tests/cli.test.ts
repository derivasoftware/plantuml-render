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

  it("reports a kind that is not drawn on stderr, draws the notice and exits 0", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pr-"));
    const puml = join(dir, "flow.puml");
    writeFileSync(puml, "@startuml\nstart\n:Read;\nstop\n@enduml\n");
    const out = join(dir, "flow.svg");
    let err = "";
    expect(await main([puml, "-o", out], { stderr: (t) => (err += t) })).toBe(0);
    expect(err).toContain("flow.puml: Activity diagram: not drawn by plantuml-render (kept lossless). Render this kind with plantuml.jar.");
    expect(readFileSync(out, "utf8")).toContain('class="pr-notice"');
  });

  it("reports an invalid --ir document as one line with exit code 1", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pr-"));
    const irFile = join(dir, "bad.json");
    writeFileSync(irFile, "{}");
    let err = "";
    expect(await main(["--ir", irFile], { stderr: (t) => (err += t), stdout: () => undefined })).toBe(1);
    expect(err).toContain("invalid render-IR");
  });

  it("fails usage without input", async () => {
    expect(await main([])).toBe(2);
  });
});

import { execFileSync } from "node:child_process";
import { mkdtempSync, symlinkSync, writeFileSync as wf } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as res } from "node:path";

it("cli runs through a symlinked bin entry (global install shape)", () => {
  const dir = mkdtempSync(join(tmpdir(), "pr-bin-"));
  const link = join(dir, "plantuml-render");
  symlinkSync(res("out/render/cli.js"), link);
  const puml = join(dir, "d.puml");
  wf(puml, "@startuml\nclass A\n@enduml\n");
  const svg = execFileSync(process.execPath, [link, puml]).toString();
  expect(svg).toContain("<svg");
});
