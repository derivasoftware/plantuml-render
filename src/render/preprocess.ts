/**
 * Include expansion: the preprocessor half a renderer needs to draw
 * aggregate files, whose content lives behind `!includesub file!NAME`
 * (a named `!startsub` fragment of another file) and `!include file`.
 *
 * Environment-neutral: file access is injected, so the node CLI wires
 * fs and the vscode extension host wires workspace.fs — the webview
 * itself never touches files. Missing targets keep their directive
 * line verbatim (it parses as a raw frontier line and draws nothing),
 * matching the argos reader's lenient posture; cycles are cut silently.
 */

export interface IncludeLoader {
  /** Absolute-path read; null when unreadable. */
  read(path: string): Promise<string | null> | string | null;
  /** Resolve a directive's relative path against the including file's base. */
  resolve(base: string, relative: string): string;
  /** Base (directory) of a resolved path, for nested expansion. */
  dirname(path: string): string;
}

const INCLUDESUB = /^\s*!includesub\s+([^\s!]+)!(\w+)\s*$/;
const INCLUDE = /^\s*!include\s+(\S+)\s*$/;
const STARTSUB = /^\s*!startsub\s+(\w+)\s*$/;
const ENDSUB = /^\s*!endsub\s*$/;
const ENVELOPE = /^\s*@(startuml|enduml)\b/;

export async function expandIncludes(
  source: string,
  base: string,
  loader: IncludeLoader,
  seen: Set<string> = new Set(),
): Promise<string> {
  const out: string[] = [];
  for (const line of source.split("\n")) {
    let match = INCLUDESUB.exec(line);
    if (match) {
      const target = loader.resolve(base, match[1]);
      const body = await loadFragment(target, match[2], loader, seen);
      out.push(body ?? line);
      continue;
    }
    match = INCLUDE.exec(line);
    if (match) {
      const target = loader.resolve(base, match[1]);
      const body = await loadWhole(target, loader, seen);
      out.push(body ?? line);
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

async function loadWhole(
  path: string,
  loader: IncludeLoader,
  seen: Set<string>,
): Promise<string | null> {
  if (seen.has(path)) return "";
  seen.add(path);
  const text = await loader.read(path);
  if (text === null) return null;
  const body = text
    .split("\n")
    .filter((l) => !ENVELOPE.test(l))
    .join("\n");
  return expandIncludes(body, loader.dirname(path), loader, seen);
}

async function loadFragment(
  path: string,
  sub: string,
  loader: IncludeLoader,
  seen: Set<string>,
): Promise<string | null> {
  const key = `${path}!${sub}`;
  if (seen.has(key)) return "";
  seen.add(key);
  const text = await loader.read(path);
  if (text === null) return null;
  const lines: string[] = [];
  let inside = false;
  for (const line of text.split("\n")) {
    const start = STARTSUB.exec(line);
    if (start) {
      inside = start[1] === sub;
      continue;
    }
    if (ENDSUB.test(line)) {
      inside = false;
      continue;
    }
    if (inside) lines.push(line);
  }
  if (lines.length === 0) return null;
  return expandIncludes(lines.join("\n"), loader.dirname(path), loader, seen);
}
