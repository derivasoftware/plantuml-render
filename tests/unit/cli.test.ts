// @covers render.cli.helpText, render.cli.packagedDocs, render.cli.walk
// @covers render.cli.renderFile, render.cli.main
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TOPICS, helpText, main, packagedDocs, renderFile, walk } from "../../src/render/cli.js";
import type { Serving } from "../../src/render/serve.js";
import { VERSION } from "../../src/render/version.gen.js";

// `main serve` never returns, so the real server it starts is recorded here
// for the test to close.
const started = vi.hoisted(() => [] as unknown[]);
vi.mock("../../src/render/serve.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/render/serve.js")>();
  return {
    ...actual,
    startServer: async (file: string, port?: number) => {
      const serving = await actual.startServer(file, port);
      started.push({ serving, file, port });
      return serving;
    },
  };
});

const PUML = "@startuml\nclass Widget\n@enduml\n";
const BROKEN = "@startuml\nclass {\n@enduml\n";
const PARTIAL = "@startuml\nclass Kept\nclass {\n@enduml\n";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pr-cli-unit-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const put = (name: string, text: string) => {
  const path = join(dir, name);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
  return path;
};

/** Run `main` with its output captured. */
const run = async (argv: string[], deps: Parameters<typeof main>[1] = {}) => {
  let stdout = "";
  let stderr = "";
  const code = await main(argv, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    ...deps,
  });
  return { code, stdout, stderr };
};

describe("helpText", () => {
  it("opens with the given version", () => {
    expect(helpText("9.9.9").split("\n")[0]).toBe("plantuml-render 9.9.9 — deterministic SVG from PlantUML. No Java; one binary.");
  });

  it("lists every manual topic", () => {
    expect(helpText("1")).toContain(`the manual (topics: ${TOPICS.join(", ")})`);
  });

  it("names each section and each option `main` accepts", () => {
    const text = helpText("1");
    for (const piece of ["USAGE", "OPTIONS", "OUTPUT", "EXIT", "EXAMPLES", "--out", "--links", "--link-template", "--outline", "--token", "--ir", "--port", "--version", "--help"]) {
      expect(text).toContain(piece);
    }
  });

  it("documents the three exit codes", () => {
    expect(helpText("1")).toMatch(/\n {2}0 {3}drawn[\s\S]*\n {2}1 {3}a file was not drawn[\s\S]*\n {2}2 {3}usage/);
  });
});

describe("packagedDocs", () => {
  it("reads every topic of the manual from the package tree", () => {
    const docs = packagedDocs();
    expect(Object.keys(docs)).toEqual([...TOPICS]);
    for (const topic of TOPICS) {
      expect(docs[topic]).toBe(readFileSync(new URL(`../../doc/manual/${topic}.md`, import.meta.url), "utf8"));
      expect(docs[topic].length).toBeGreaterThan(0);
    }
  });

  it("leaves out a topic a trimmed install does not carry", async () => {
    vi.resetModules();
    vi.doMock("node:fs", async (importOriginal) => {
      const fs = await importOriginal<typeof import("node:fs")>();
      return {
        ...fs,
        readFileSync: (...args: Parameters<typeof fs.readFileSync>) => {
          if (String(args[0]).endsWith("/style.md")) throw new Error("ENOENT");
          return fs.readFileSync(...args);
        },
      };
    });
    try {
      const fresh = await import("../../src/render/cli.js");
      const docs = fresh.packagedDocs();
      expect(Object.keys(docs)).toEqual(TOPICS.filter((t) => t !== "style"));
    } finally {
      vi.doUnmock("node:fs");
      vi.resetModules();
    }
  });
});

describe("walk", () => {
  it("collects every PlantUML extension, depth first, sorted by name", () => {
    put("b.puml", "");
    put("a.plantuml", "");
    put("c/inner.iuml", "");
    put("c/deep/er.wsd", "");
    put("d.puml", "");
    expect(walk(dir)).toEqual([
      join(dir, "a.plantuml"),
      join(dir, "b.puml"),
      join(dir, "c/deep/er.wsd"),
      join(dir, "c/inner.iuml"),
      join(dir, "d.puml"),
    ]);
  });

  it("skips other files, and names that only contain an extension", () => {
    put("notes.md", "");
    put("x.puml.bak", "");
    put("puml", "");
    expect(walk(dir)).toEqual([]);
  });

  it("descends into a directory even when its name looks like a diagram", () => {
    put("odd.puml/inside.puml", "");
    expect(walk(dir)).toEqual([join(dir, "odd.puml/inside.puml")]);
  });

  it("is empty for an empty directory", () => {
    expect(walk(dir)).toEqual([]);
  });

  it("appends to the accumulator it is given and returns it", () => {
    const file = put("a.puml", "");
    const acc = ["seed"];
    expect(walk(dir, acc)).toBe(acc);
    expect(acc).toEqual(["seed", file]);
  });

  it("throws for a directory that does not exist", () => {
    expect(() => walk(join(dir, "nope"))).toThrow(/ENOENT/);
  });
});

describe("renderFile", () => {
  const silent = () => {};

  it("renders a file to SVG without warning", async () => {
    const warnings: string[] = [];
    const svg = await renderFile(put("a.puml", PUML), {}, (t) => warnings.push(t));
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('data-id="Widget"');
    expect(warnings).toEqual([]);
  });

  it("titles an untitled diagram after the file, and keeps a title it has", async () => {
    expect(await renderFile(put("named-after-me.puml", PUML), {}, silent)).toContain("<title>named-after-me</title>");
    const titled = await renderFile(put("other.puml", "@startuml mine\nclass A\n@enduml\n"), {}, silent);
    expect(titled).toContain("<title>mine</title>");
    expect(titled).not.toContain("<title>other</title>");
  });

  it("expands includes relative to the file", async () => {
    put("inc/part.iuml", "class FromInclude\n");
    const svg = await renderFile(put("a.puml", "@startuml\n!include inc/part.iuml\n@enduml\n"), {}, silent);
    expect(svg).toContain('data-id="FromInclude"');
  });

  it("refuses a file with a missing include, naming the target", async () => {
    const file = put("a.puml", "@startuml\n!include gone.iuml\nclass A\n@enduml\n");
    await expect(renderFile(file, {}, silent)).rejects.toThrow(`include target not found: ${join(dir, "gone.iuml")}`);
  });

  it("refuses a source that does not parse and leaves nothing to draw", async () => {
    await expect(renderFile(put("a.puml", BROKEN), {}, silent)).rejects.toThrow("does not parse (line 2) and leaves nothing to draw");
  });

  it("draws what parses of a partial source and warns with the line", async () => {
    const file = put("a.puml", PARTIAL);
    const warnings: string[] = [];
    const svg = await renderFile(file, {}, (t) => warnings.push(t));
    expect(svg).toContain('data-id="Kept"');
    expect(warnings).toEqual([`${file}: does not parse at line 3; drawing what parses\n`]);
  });

  it("repeats a producer's notice as a warning and in the SVG", async () => {
    const file = put("a.puml", "@startuml\nA -> B\n@enduml\n");
    const notice = "Nothing drawn: 1 relation reference entities that are not declared in this diagram.";
    const warnings: string[] = [];
    const svg = await renderFile(file, {}, (t) => warnings.push(t));
    expect(svg).toContain(notice);
    expect(warnings).toEqual([`${file}: ${notice}\n`]);
  });

  it("applies links and tokens", async () => {
    const svg = await renderFile(put("a.puml", PUML), { map: { Widget: "https://x.dev/w" } }, silent, { "--pr-stroke": "#123456" });
    expect(svg).toContain('<a href="https://x.dev/w"');
    expect(svg).toContain("--pr-stroke: #123456;");
  });

  it("rejects a file that does not exist", async () => {
    await expect(renderFile(join(dir, "nope.puml"), {}, silent)).rejects.toThrow(/ENOENT/);
  });
});

describe("main: help, version, docs", () => {
  it("prints help to stderr and exits 2 with no arguments", async () => {
    const r = await run([], { version: "1.2.3" });
    expect(r).toEqual({ code: 2, stdout: "", stderr: helpText("1.2.3") });
  });

  it.each(["--help", "-h"])("prints help to stdout on %s", async (flag) => {
    const r = await run([flag], { version: "1.2.3" });
    expect(r).toEqual({ code: 0, stdout: helpText("1.2.3"), stderr: "" });
  });

  it.each(["--version", "-V"])("prints the injected version on %s", async (flag) => {
    expect(await run([flag], { version: "1.2.3" })).toEqual({ code: 0, stdout: "1.2.3\n", stderr: "" });
  });

  it("falls back to the build's version", async () => {
    expect((await run(["--version"])).stdout).toBe(`${VERSION}\n`);
  });

  it("writes through the process streams when no sinks are injected", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      expect(await main(["--version"], { version: "7.7.7" })).toBe(0);
      expect(write).toHaveBeenCalledWith("7.7.7\n");
    } finally {
      write.mockRestore();
    }
  });

  it("`docs` lists the topics and shows the diagrams page", async () => {
    const r = await run(["docs"], { docs: { diagrams: "DIAGRAMS PAGE" } });
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(`Topics: ${TOPICS.join(", ")}\n\nDIAGRAMS PAGE`);
  });

  it("`docs` still lists the topics when the manual is missing", async () => {
    const r = await run(["docs"], { docs: {} });
    expect(r.stdout).toBe(`Topics: ${TOPICS.join(", ")}\n\n`);
  });

  it("`docs <topic>` prints that page", async () => {
    expect(await run(["docs", "style"], { docs: { style: "STYLE PAGE" } })).toEqual({ code: 0, stdout: "STYLE PAGE", stderr: "" });
  });

  it("`docs <unknown>` names the topics and exits 2", async () => {
    const r = await run(["docs", "nope"], { docs: {} });
    expect(r.code).toBe(2);
    expect(r.stdout).toBe("");
    expect(r.stderr).toBe(`unknown topic 'nope'. Topics: ${TOPICS.join(", ")}\n`);
  });

  it("`docs` reads the packaged manual when none is injected", async () => {
    const r = await run(["docs", "contract"]);
    expect(r.stdout).toBe(packagedDocs().contract);
  });
});

describe("main: serve", () => {
  afterAll(() => {
    for (const entry of started as { serving: Serving }[]) entry.serving.close();
  });

  it("wants a file", async () => {
    const r = await run(["serve"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toBe("usage: plantuml-render serve <file.puml> [--port N]\n");
  });

  it("starts the server on the file, says where, and stays alive", async () => {
    const file = put("a.puml", PUML);
    let settled = false;
    const announced = new Promise<string>((resolve) => {
      void main(["serve", file, "--port", "0"], { stdout: resolve, stderr: () => {} }).finally(() => {
        settled = true;
      });
    });
    const line = await announced;
    const entry = started.at(-1) as { serving: Serving; file: string; port: number };
    expect(entry.file).toBe(file);
    expect(entry.port).toBe(0);
    expect(line).toBe(`serving http://127.0.0.1:${entry.serving.port}/ (watching ${file})\n`);
    const res = await fetch(`http://127.0.0.1:${entry.serving.port}/`);
    expect(res.status).toBe(200);
    await res.text();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);
  });
});

describe("main: arguments", () => {
  it("names the choices for an unknown --outline and exits 2", async () => {
    const r = await run([put("a.puml", PUML), "--outline", "heavy"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toBe("unknown --outline 'heavy'. Use: normal, bold\n");
  });

  it.each(["no-equals", "=value"])("rejects --token %s", async (pair) => {
    const r = await run([put("a.puml", PUML), "--token", pair]);
    expect(r.code).toBe(2);
    expect(r.stderr).toBe(`--token wants name=value, got '${pair}'\n`);
  });

  it("prints usage and exits 2 with no input", async () => {
    const r = await run(["render"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("usage: plantuml-render [render] <file|dir>");
  });

  it("exits 2 for an input that does not exist", async () => {
    const missing = join(dir, "nope.puml");
    const r = await run([missing]);
    expect(r.code).toBe(2);
    expect(r.stderr).toBe(`no such file or directory: ${missing}\n`);
  });
});

describe("main: one file", () => {
  it("writes the SVG to stdout without -o", async () => {
    const r = await run([put("a.puml", PUML)]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^<svg /);
    expect(r.stdout).toContain('data-id="Widget"');
    expect(r.stderr).toBe("");
  });

  it("takes the `render` word as well", async () => {
    const r = await run(["render", put("a.puml", PUML)]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('data-id="Widget"');
  });

  it.each(["-o", "--out"])("writes to the %s target and leaves stdout empty", async (flag) => {
    const target = join(dir, "out.svg");
    const r = await run([put("a.puml", PUML), flag, target]);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
    expect(readFileSync(target, "utf8")).toContain('data-id="Widget"');
  });

  it("exits 1 and names the file when it cannot be drawn", async () => {
    const file = put("a.puml", BROKEN);
    const r = await run([file]);
    expect(r.code).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toBe(`${file}: does not parse (line 2) and leaves nothing to draw\n`);
  });

  it("exits 1 when the target cannot be written", async () => {
    const r = await run([put("a.puml", PUML), "-o", join(dir, "no/such/dir/out.svg")]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/ENOENT/);
  });

  it("draws and warns on a partial source, with exit 0", async () => {
    const file = put("a.puml", PARTIAL);
    const r = await run([file]);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe(`${file}: does not parse at line 3; drawing what parses\n`);
  });

  it("bakes the bold outline in, and nothing by default", async () => {
    const file = put("a.puml", PUML);
    const bold = await run([file, "--outline", "bold"]);
    expect(bold.stdout).toContain("--pr-stroke: #334155;");
    expect(bold.stdout).toContain("--pr-stroke-width: 2;");
    expect(bold.stdout).toContain("--pr-container-stroke: #475569;");
    const normal = await run([file, "--outline", "normal"]);
    expect(normal.stdout).toBe((await run([file])).stdout);
    expect(normal.stdout).not.toContain("--pr-stroke: #334155;");
  });

  it("lets repeated --token flags set and override tokens, splitting on the first =", async () => {
    const r = await run([put("a.puml", PUML), "--outline", "bold", "--token", "--pr-stroke=#111111", "--token", "--pr-x=a=b"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("--pr-stroke: #111111;");
    expect(r.stdout).not.toContain("--pr-stroke: #334155;");
    expect(r.stdout).toContain("--pr-x: a=b;");
  });

  it("applies a --links map from a file", async () => {
    const links = put("links.json", JSON.stringify({ Widget: "https://x.dev/w" }));
    const r = await run([put("a.puml", PUML), "--links", links]);
    expect(r.stdout).toContain('<a href="https://x.dev/w"');
  });

  it("applies a --link-template", async () => {
    const r = await run([put("a.puml", PUML), "--link-template", "https://x.dev/{id}"]);
    expect(r.stdout).toContain('<a href="https://x.dev/Widget"');
  });
});

describe("main: --ir", () => {
  const MODEL = JSON.stringify({ ir: 1, nodes: [{ id: "A", kind: "box", label: "Alpha" }], edges: [] });

  it("draws a render-IR document to stdout", async () => {
    const r = await run(["--ir", put("m.json", MODEL)]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('data-id="A"');
    expect(r.stdout).toContain("Alpha");
  });

  it("writes it to the -o target, with links and tokens", async () => {
    const target = join(dir, "m.svg");
    const r = await run(["--ir", put("m.json", MODEL), "-o", target, "--link-template", "https://x.dev/{id}", "--token", "--pr-stroke=#123456"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
    const svg = readFileSync(target, "utf8");
    expect(svg).toContain('<a href="https://x.dev/A"');
    expect(svg).toContain("--pr-stroke: #123456;");
  });

  it("exits 1 on a document that is not valid IR, naming the file", async () => {
    const file = put("m.json", JSON.stringify({ ir: 1 }));
    const r = await run(["--ir", file]);
    expect(r.code).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr.startsWith(`${file}: `)).toBe(true);
  });

  it("exits 1 on text that is not JSON", async () => {
    const file = put("m.json", "{ not json");
    const r = await run(["--ir", file]);
    expect(r.code).toBe(1);
    expect(r.stderr.startsWith(`${file}: `)).toBe(true);
  });
});

describe("main: a directory", () => {
  it("wants -o", async () => {
    const r = await run([dir]);
    expect(r.code).toBe(2);
    expect(r.stderr).toBe("render <dir> needs -o <dir>\n");
  });

  it("mirrors the tree with .svg names and reports the count", async () => {
    const src = join(dir, "src");
    put("src/a.puml", PUML);
    put("src/sub/deep/b.wsd", "@startuml\nclass Bravo\n@enduml\n");
    put("src/readme.md", "not a diagram");
    const target = join(dir, "site");
    const r = await run(["render", src, "-o", target]);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe(`2 of 2 diagrams → ${target}\n`);
    expect(walk(src)).toHaveLength(2);
    expect(readFileSync(join(target, "a.svg"), "utf8")).toContain('data-id="Widget"');
    expect(readFileSync(join(target, "sub/deep/b.svg"), "utf8")).toContain('data-id="Bravo"');
  });

  it("names each failure, writes the rest and exits 1", async () => {
    const src = join(dir, "src");
    const bad = put("src/bad.puml", BROKEN);
    put("src/good.puml", PUML);
    const target = join(dir, "site");
    const r = await run([src, "-o", target]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(`${bad}: does not parse (line 2) and leaves nothing to draw\n`);
    expect(r.stderr).toContain(`1 of 2 diagrams → ${target}\n`);
    expect(readFileSync(join(target, "good.svg"), "utf8")).toContain('data-id="Widget"');
    expect(() => readFileSync(join(target, "bad.svg"))).toThrow(/ENOENT/);
  });

  it("exits 0 on a directory with nothing to draw", async () => {
    const src = join(dir, "src");
    put("src/readme.md", "");
    const r = await run([src, "-o", join(dir, "site")]);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe(`0 of 0 diagrams → ${join(dir, "site")}\n`);
  });

  it("carries tokens and links into every file", async () => {
    const src = join(dir, "src");
    put("src/a.puml", PUML);
    const target = join(dir, "site");
    await run([src, "-o", target, "--outline", "bold", "--link-template", "https://x.dev/{id}"]);
    const svg = readFileSync(join(target, "a.svg"), "utf8");
    expect(svg).toContain("--pr-stroke: #334155;");
    expect(svg).toContain('<a href="https://x.dev/Widget"');
  });
});
