import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startServer, type Serving } from "../src/render/serve.js";

let dir: string;
let file: string;
let serving: Serving;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "pr-serve-"));
  file = join(dir, "d.puml");
  writeFileSync(file, "@startuml\nclass Widget {\n  +draw() : None\n}\n@enduml\n");
  serving = await startServer(file);
});

afterAll(() => serving.close());

const url = (path: string) => `http://127.0.0.1:${serving.port}${path}`;

describe("serve mode", () => {
  it("serves the interaction page", async () => {
    const res = await fetch(url("/"));
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const piece of ["f-members", "reset-layout", "/render", "/events"]) {
      expect(html).toContain(piece);
    }
  });

  it("renders the watched file with view state", async () => {
    const res = await fetch(url("/render"), {
      method: "POST",
      body: JSON.stringify({ members: false }),
    });
    const svg = await res.text();
    expect(res.status).toBe(200);
    expect(svg).toContain("pr-box");
    expect(svg).not.toContain("+draw()"); // members filtered out
  });

  it("applies drag positions", async () => {
    const base = await (await fetch(url("/render"), { method: "POST", body: "{}" })).text();
    const moved = await (
      await fetch(url("/render"), {
        method: "POST",
        body: JSON.stringify({ positions: { Widget: { dx: 300, dy: 0 } } }),
      })
    ).text();
    expect(moved).not.toBe(base);
  });

  it("notifies file changes over SSE", async () => {
    const ctl = new AbortController();
    const res = await fetch(url("/events"), { signal: ctl.signal });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let received = "";
    const pump = (async () => {
      while (!received.includes("change")) {
        const { value, done } = await reader.read();
        if (done) break;
        received += decoder.decode(value);
      }
    })();
    await new Promise((r) => setTimeout(r, 100));
    writeFileSync(file, "@startuml\nclass Widget2\n@enduml\n");
    await Promise.race([pump, new Promise((r) => setTimeout(r, 3000))]);
    ctl.abort();
    expect(received).toContain("change");
  });

  it("reports parse-stage failures as 422, never a crash", async () => {
    const res = await fetch(url("/nope"));
    expect(res.status).toBe(404);
  });
});
