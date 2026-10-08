import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { main } from "../../src/render/cli.js";

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
    writeFileSync(puml, "@startuml\nnode Server\nnode Client\nClient --> Server\n@enduml\n");
    const out = join(dir, "flow.svg");
    let err = "";
    expect(await main([puml, "-o", out], { stderr: (t) => (err += t) })).toBe(0);
    expect(err).toContain("flow.puml: Deployment diagram: not drawn by plantuml-render (kept lossless). Render this kind with plantuml.jar.");
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

describe("outlines and theme tokens", () => {
  const render = async (args: string[]) => {
    const dir = mkdtempSync(join(tmpdir(), "pr-"));
    const puml = join(dir, "d.puml");
    writeFileSync(puml, "@startuml\npackage P {\n  class Foo\n}\n@enduml\n");
    const out = join(dir, "d.svg");
    let stderr = "";
    const code = await main([puml, "-o", out, ...args], { stderr: (t) => { stderr += t; } });
    return { code, stderr, svg: code === 0 ? readFileSync(out, "utf8") : "" };
  };

  it("leaves the defaults alone unless asked", async () => {
    const { code, svg } = await render([]);
    expect(code).toBe(0);
    // No override block: the drawing carries only the stylesheet's own values.
    expect(svg).not.toMatch(/\.pr-diagram \{ --pr-stroke:/);
    expect(svg).toContain("--pr-stroke-width: 1");
  });

  it("bakes the bold outline in, after the defaults so it wins", async () => {
    const { code, svg } = await render(["--outline", "bold"]);
    expect(code).toBe(0);
    const rule = /\.pr-diagram \{ (--pr-stroke: #334155; --pr-container-stroke: #475569; --pr-stroke-width: 2; --pr-container-stroke-width: 2;) \}/.exec(svg)!;
    expect(rule).not.toBeNull();
    expect(svg.indexOf("--pr-stroke-width: 1")).toBeLessThan(svg.indexOf(rule[0]));
  });

  it("sets any token, and a later one wins over the preset", async () => {
    const { code, svg } = await render(["--outline", "bold", "--token", "--pr-stroke=#000000", "--token", "--pr-box-fill=#fffbea"]);
    expect(code).toBe(0);
    expect(svg).toContain("--pr-stroke: #000000;");
    expect(svg).toContain("--pr-box-fill: #fffbea;");
    expect(svg).toContain("--pr-stroke-width: 2;");
  });

  it("refuses an outline it does not know and a token without a value", async () => {
    const bad = await render(["--outline", "screaming"]);
    expect(bad.code).toBe(2);
    expect(bad.stderr).toContain("unknown --outline");
    const pair = await render(["--token", "--pr-stroke"]);
    expect(pair.code).toBe(2);
    expect(pair.stderr).toContain("name=value");
  });

  it("keeps a token name and value from carrying anything else into the stylesheet", async () => {
    const { svg } = await render(["--token", "--pr-stroke=#333; } body { display:none", "--token", "nonsense=1"]);
    // The value cannot close the rule it is in, and a name that is not a
    // custom property is dropped rather than written into the stylesheet.
    const rules = [...svg.matchAll(/\n  \.pr-diagram \{ ([^}]*) \}/g)];
    const override = rules[rules.length - 1][1];
    expect(override).toContain("--pr-stroke:");
    expect(override).not.toMatch(/[;{}]\s*\S/);
    expect(svg).not.toContain("nonsense");
    // What is left is the value of a custom property and nothing else: it
    // reaches the drawing only through `var()`, where it is simply invalid.
    expect(override.split(";").filter(Boolean)).toHaveLength(1);
  });
});
