import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { TOPICS, helpText, main } from "../../src/render/cli.js";
import { VERSION } from "../../src/render/version.gen.js";

const run = async (argv: string[], deps: Record<string, unknown> = {}) => {
  let out = "";
  let err = "";
  const code = await main(argv, { stdout: (t) => (out += t), stderr: (t) => (err += t), ...deps });
  return { code, out, err };
};

describe("command line", () => {
  it("prints the version and a help screen that names every subcommand", async () => {
    expect((await run(["--version"])).out.trim()).toBe(VERSION);
    const { code, out } = await run(["--help"]);
    expect(code).toBe(0);
    for (const word of ["render", "--ir", "serve", "docs", "--version"]) expect(out).toContain(word);
    expect(helpText("1.2.3")).toContain("plantuml-render 1.2.3");
    const bare = await run([]);
    expect(bare.code).toBe(2);
    expect(bare.err).toContain("USAGE");
  });

  it("serves the manual from the package and from injected copies", async () => {
    const packaged = await run(["docs", "embedding"]);
    expect(packaged.code).toBe(0);
    expect(packaged.out).toContain(".pr-diagram");
    const index = await run(["docs"]);
    for (const topic of TOPICS) expect(index.out).toContain(topic);
    const injected = await run(["docs", "style"], { docs: { style: "# injected\n" } });
    expect(injected.out).toBe("# injected\n");
    const unknown = await run(["docs", "nope"]);
    expect(unknown.code).toBe(2);
    expect(unknown.err).toContain("unknown topic");
  });

  it("renders a directory into a mirrored tree of SVGs", async () => {
    const root = mkdtempSync(join(tmpdir(), "pr-batch-"));
    mkdirSync(join(root, "in", "sub"), { recursive: true });
    writeFileSync(join(root, "in", "CL_A.puml"), "@startuml CL_A\nclass A\n@enduml\n");
    writeFileSync(join(root, "in", "sub", "CL_B.puml"), "@startuml CL_B\nclass B\n@enduml\n");
    writeFileSync(join(root, "in", "notes.txt"), "ignored");
    const { code, err } = await run(["render", join(root, "in"), "-o", join(root, "out")]);
    expect(code).toBe(0);
    expect(err).toContain("2 of 2 diagrams");
    expect(existsSync(join(root, "out", "CL_A.svg"))).toBe(true);
    expect(readFileSync(join(root, "out", "sub", "CL_B.svg"), "utf8")).toContain('data-id="B"');
    expect((await run(["render", join(root, "in")])).code).toBe(2);
  });

  it("parses through the wasm grammar: no native binding in the dependencies", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    expect(Object.keys(pkg.dependencies)).toContain("web-tree-sitter");
    expect(Object.keys(pkg.dependencies)).not.toContain("tree-sitter");
    expect(Object.keys(pkg.dependencies)).not.toContain("tree-sitter-plantuml");
    expect(pkg.config.grammar).toMatch(/tree-sitter-plantuml\.git#v\d+\.\d+\.\d+$/);
    expect(existsSync(new URL("../../grammar/tree-sitter-plantuml.wasm", import.meta.url))).toBe(true);
  });
});

describe("what the manual promises", () => {
  it("only sends the reader to topics that exist", async () => {
    const { TOPICS } = await import("../../src/render/cli.js");
    const dir = new URL("../../doc/manual/", import.meta.url);
    const missing: string[] = [];
    for (const topic of TOPICS) {
      const text = readFileSync(new URL(`${topic}.md`, dir), "utf8");
      for (const m of text.matchAll(/plantuml-render docs ([\w-]+)/g)) {
        if (!(TOPICS as readonly string[]).includes(m[1])) missing.push(`${topic}.md -> ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("describes the markup the engine actually emits", async () => {
    const { renderSvg } = await import("../../src/render/engine.js");
    const svg = await renderSvg({
      ir: 1 as const,
      nodes: [
        { id: "A", kind: "box" as const, label: "A" },
        { id: "B", kind: "box" as const, label: "B" },
      ],
      edges: [{ from: "A", to: "B", kind: "association" as const }],
    });
    const navigation = readFileSync(new URL("../../doc/manual/navigation.md", import.meta.url), "utf8");
    // Every hook the page names has to be in the drawing it describes.
    for (const hook of ["data-id", "pr-edge-group", "pr-edge-hit", "pr-focusing", "pr-focus-root"]) {
      expect(navigation).toContain(hook);
      expect(svg).toContain(hook);
    }
  });
});
