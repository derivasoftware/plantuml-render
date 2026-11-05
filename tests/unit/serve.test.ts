// @covers render.serve.renderFile, render.serve.startServer
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderFile, startServer, type Serving } from "../../src/render/serve.js";
import { PAGE } from "../../src/render/serve-page.js";

const CLASS = "@startuml\nclass Widget {\n  +draw() : None\n}\n@enduml\n";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pr-serve-unit-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const put = (name: string, text: string) => {
  const path = join(dir, name);
  writeFileSync(path, text);
  return path;
};

describe("renderFile", () => {
  it("renders the file with no view state", async () => {
    const svg = await renderFile(put("a.puml", CLASS));
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('data-id="Widget"');
    expect(svg).toContain("draw");
  });

  it("expands includes relative to the file", async () => {
    put("part.iuml", "class FromInclude\n");
    const svg = await renderFile(put("a.puml", "@startuml\n!include part.iuml\n@enduml\n"));
    expect(svg).toContain('data-id="FromInclude"');
  });

  it("stays lenient about a missing include and draws the rest", async () => {
    const svg = await renderFile(put("a.puml", "@startuml\n!include gone.iuml\nclass Kept\n@enduml\n"));
    expect(svg).toContain('data-id="Kept"');
  });

  it("strips members only when `members` is false", async () => {
    const file = put("a.puml", CLASS);
    expect(await renderFile(file, { members: false })).not.toContain("draw");
    expect(await renderFile(file, { members: true })).toContain("draw");
  });

  it("flattens namespaces only when `namespaces` is false", async () => {
    const file = put("a.puml", "@startuml\nnamespace core {\n  class Inner\n}\n@enduml\n");
    const container = 'data-id="core"';
    expect(await renderFile(file, { namespaces: true })).toContain(container);
    const flat = await renderFile(file, { namespaces: false });
    expect(flat).not.toContain(container);
    expect(flat).toContain("Inner");
  });

  it("hides notes only when `notes` is false", async () => {
    const file = put("a.puml", "@startuml\nclass A\nnote left of A : remember this\n@enduml\n");
    expect(await renderFile(file, { notes: true })).toContain("remember this");
    expect(await renderFile(file, { notes: false })).not.toContain("remember this");
  });

  it("moves a box by its drag position", async () => {
    const file = put("a.puml", CLASS);
    const x = (svg: string) => Number(/data-id="Widget"[^>]*>(?:(?!<rect)[\s\S])*?<rect x="(-?[\d.]+)"/.exec(svg)![1]);
    const base = await renderFile(file);
    const moved = await renderFile(file, { positions: { Widget: { dx: 300, dy: 0 } } });
    expect(moved).not.toBe(base);
    expect(x(moved)).toBe(x(base) + 300);
  });

  it("rejects a file that does not exist", async () => {
    await expect(renderFile(join(dir, "nope.puml"))).rejects.toThrow(/ENOENT/);
  });
});

describe("startServer", () => {
  let serving: Serving | undefined;
  afterEach(() => {
    serving?.close();
    serving = undefined;
  });
  const url = (path: string) => `http://127.0.0.1:${serving!.port}${path}`;
  const render = (body: string) => fetch(url("/render"), { method: "POST", body });

  it("binds an ephemeral port on loopback when none is given", async () => {
    serving = await startServer(put("a.puml", CLASS));
    expect(serving.port).toBeGreaterThan(0);
    expect((await fetch(url("/"))).status).toBe(200);
  });

  it("serves the page at /", async () => {
    serving = await startServer(put("a.puml", CLASS));
    const res = await fetch(url("/"));
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await res.text()).toBe(PAGE);
  });

  it("serves the built focus module as JavaScript", async () => {
    serving = await startServer(put("a.puml", CLASS));
    const res = await fetch(url("/focus.js"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(await res.text()).toMatch(/export /);
  });

  it("renders the watched file on POST /render, as SVG", async () => {
    serving = await startServer(put("a.puml", CLASS));
    const res = await render("{}");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
    const svg = await res.text();
    expect(svg).toContain('data-id="Widget"');
    expect(svg).toContain("draw");
  });

  it("applies the view state in the body", async () => {
    serving = await startServer(put("a.puml", CLASS));
    expect(await (await render(JSON.stringify({ members: false }))).text()).not.toContain("draw");
  });

  it("treats an empty or malformed body as no view state", async () => {
    serving = await startServer(put("a.puml", CLASS));
    const baseline = await (await render("{}")).text();
    for (const body of ["", "{ not json"]) {
      const res = await render(body);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(baseline);
    }
  });

  it("reads the file anew on each render", async () => {
    const file = put("a.puml", CLASS);
    serving = await startServer(file);
    expect(await (await render("{}")).text()).toContain('data-id="Widget"');
    writeFileSync(file, "@startuml\nclass Gadget\n@enduml\n");
    const svg = await (await render("{}")).text();
    expect(svg).toContain('data-id="Gadget"');
    expect(svg).not.toContain('data-id="Widget"');
  });

  it("answers 422 with the error when the file cannot be rendered", async () => {
    const file = join(dir, "not-yet.puml");
    serving = await startServer(file);
    const res = await render("{}");
    expect(res.status).toBe(422);
    expect(res.headers.get("content-type")).toBe("text/plain");
    expect(await res.text()).toMatch(/ENOENT/);
  });

  it.each([
    ["GET", "/nope"],
    ["GET", "/render"],
    ["POST", "/"],
    ["POST", "/focus.js"],
  ])("answers 404 to %s %s", async (method, path) => {
    serving = await startServer(put("a.puml", CLASS));
    const res = await fetch(url(path), { method });
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
  });

  it("greets an /events client, then tells it when the directory changes", async () => {
    const file = put("a.puml", CLASS);
    serving = await startServer(file);
    const ctl = new AbortController();
    const res = await fetch(url("/events"), { signal: ctl.signal });
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    try {
      let seen = decoder.decode((await reader.read()).value);
      expect(seen).toContain("data: hello\n\n");
      // a sibling, not the file itself: includes live next to it
      put("sibling.iuml", "class S\n");
      while (!seen.includes("data: change\n\n")) {
        const { value, done } = await reader.read();
        expect(done).toBe(false);
        seen += decoder.decode(value);
      }
    } finally {
      ctl.abort();
    }
  });

  it("ends the open /events streams and stops listening on close", async () => {
    const running = await startServer(put("a.puml", CLASS));
    const res = await fetch(`http://127.0.0.1:${running.port}/events`);
    const reader = res.body!.getReader();
    await reader.read(); // hello
    running.close();
    let done = false;
    while (!done) ({ done } = await reader.read());
    expect(done).toBe(true);
    await expect(fetch(`http://127.0.0.1:${running.port}/`)).rejects.toThrow();
  });

  it("listens on the port it is told to", async () => {
    const free = await startServer(put("a.puml", CLASS));
    const port = free.port;
    free.close();
    await new Promise((resolve) => setTimeout(resolve, 20));
    serving = await startServer(join(dir, "a.puml"), port);
    expect(serving.port).toBe(port);
  });
});
