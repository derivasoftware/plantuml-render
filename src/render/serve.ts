/**
 * serve mode: the interactive preview over local HTTP, editor-agnostic.
 *
 * The server owns parsing and rendering (native grammar binding — no
 * wasm in the page); the browser page is only the interaction shell:
 * it POSTs its view state (filters, drag positions) to /render and
 * swaps the returned SVG, and reloads on /events (SSE) whenever the
 * watched file's directory changes — sibling includes included.
 * Everything stays on 127.0.0.1; nothing leaves the machine.
 */

import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { dirname, resolve } from "node:path";

import { renderSvg } from "./engine.js";
import { flattenContainers, hideNotes, stripSections } from "./filters.js";
import { pumlToIr } from "./frontend.js";
import { expandIncludes, type IncludeLoader } from "./preprocess.js";
import { PAGE } from "./serve-page.js";

const fsLoader: IncludeLoader = {
  async read(path) {
    try {
      return await readFile(path, "utf8");
    } catch {
      return null;
    }
  },
  resolve(base, relative) {
    return resolve(base, relative);
  },
  dirname(path) {
    return dirname(path);
  },
};

export interface ViewState {
  members?: boolean;
  namespaces?: boolean;
  notes?: boolean;
  positions?: Record<string, { dx: number; dy: number }>;
}

export async function renderFile(
  file: string, state: ViewState = {},
): Promise<string> {
  const raw = await readFile(file, "utf8");
  const expanded = await expandIncludes(raw, dirname(resolve(file)), fsLoader);
  let ir = await pumlToIr(expanded);
  if (state.members === false) ir = stripSections(ir);
  if (state.namespaces === false) ir = flattenContainers(ir);
  if (state.notes === false) ir = hideNotes(ir);
  return await renderSvg(ir, { positions: state.positions });
}

export interface Serving {
  port: number;
  close(): void;
}

export function startServer(file: string, port = 0): Promise<Serving> {
  const target = resolve(file);
  const clients = new Set<import("node:http").ServerResponse>();

  const watcher = watch(dirname(target), () => {
    for (const res of clients) res.write("data: change\n\n");
  });

  const server: Server = createServer((req, res) => {
    void (async () => {
      if (req.method === "GET" && req.url === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(PAGE);
      } else if (req.url === "/events") {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        res.write("data: hello\n\n");
        clients.add(res);
        req.on("close", () => clients.delete(res));
      } else if (req.method === "POST" && req.url === "/render") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        let state: ViewState = {};
        try {
          state = JSON.parse(Buffer.concat(chunks).toString() || "{}");
        } catch {
          state = {};
        }
        try {
          const svg = await renderFile(target, state);
          res.writeHead(200, { "content-type": "image/svg+xml" });
          res.end(svg);
        } catch (err) {
          res.writeHead(422, { "content-type": "text/plain" });
          res.end(String(err));
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    })();
  });

  return new Promise((resolvePromise) => {
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const boundPort = typeof address === "object" && address ? address.port : port;
      resolvePromise({
        port: boundPort,
        close() {
          watcher.close();
          for (const res of clients) res.end();
          server.close();
        },
      });
    });
  });
}
