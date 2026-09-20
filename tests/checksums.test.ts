import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SCRIPT = join(__dirname, "..", "scripts", "checksums.sh");

describe("release checksums", () => {
  it("writes a SHA256SUMS that covers every executable and verifies with sha256sum -c", () => {
    const dir = mkdtempSync(join(tmpdir(), "pr-sums-"));
    writeFileSync(join(dir, "plantuml-render-9.9.9-linux-x64"), "linux bytes");
    writeFileSync(join(dir, "plantuml-render-9.9.9-windows-x64.exe"), "windows bytes");
    writeFileSync(join(dir, "unrelated.txt"), "not an executable");

    const report = execFileSync("bash", [SCRIPT, dir], { encoding: "utf8" });
    expect(report).toContain("2 files");

    const sums = readFileSync(join(dir, "SHA256SUMS"), "utf8").trimEnd().split("\n");
    expect(sums.map((l) => l.split(/\s+/).pop())).toEqual([
      "plantuml-render-9.9.9-linux-x64",
      "plantuml-render-9.9.9-windows-x64.exe",
    ]);
    expect(sums.every((l) => /^[0-9a-f]{64}\s/.test(l))).toBe(true);

    // LC_ALL=C: a localised sha256sum says "La suma coincide" instead of "OK".
    const check = execFileSync("sha256sum", ["-c", "SHA256SUMS", "--ignore-missing"], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, LC_ALL: "C" },
    });
    expect(check).toContain("plantuml-render-9.9.9-linux-x64: OK");
    expect(check).toContain("plantuml-render-9.9.9-windows-x64.exe: OK");
  });

  it("refuses a directory without executables", () => {
    const dir = mkdtempSync(join(tmpdir(), "pr-sums-"));
    expect(() => execFileSync("bash", [SCRIPT, dir], { encoding: "utf8", stdio: "pipe" })).toThrow();
  });
});
