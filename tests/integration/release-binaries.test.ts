import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const BUILD = readFileSync(join(ROOT, "scripts", "build_binaries.sh"), "utf8");
const WORKFLOW = readFileSync(join(ROOT, ".github", "workflows", "binaries.yml"), "utf8");

/** The targets `bun build --compile` is asked for, in build order. */
function builtTargets(): string[] {
  const line = BUILD.match(/^for target in (.+); do$/m);
  expect(line, "build_binaries.sh no longer declares its targets in one loop").toBeTruthy();
  return line![1].trim().split(/\s+/);
}

/** The targets the mirror's workflow runs a binary for. */
function smokedTargets(): string[] {
  return [...WORKFLOW.matchAll(/^\s*- \{ os: [\w.-]+, target: ([\w-]+)/gm)].map((m) => m[1]);
}

describe("release binaries", () => {
  it("runs every cross-compiled target on its own platform", () => {
    // A target that is built but never run is a binary published unverified,
    // which is how v0.12.0 shipped executables that crashed at start-up.
    expect(smokedTargets().sort()).toEqual(builtTargets().sort());
  });

  it("checks the host binary through the same script the platform jobs use", () => {
    expect(BUILD).toMatch(/scripts\/smoke_binary\.sh/);
    expect(WORKFLOW).toMatch(/scripts\/smoke_binary\.sh/);
  });

  it("attaches assets only for a version tag", () => {
    expect(WORKFLOW).toMatch(/if: startsWith\(github\.ref, 'refs\/tags\/v'\)/);
  });

  it("accepts an executable that reports its version and draws the class it was given", () => {
    const dir = mkdtempSync(join(tmpdir(), "pr-smoke-"));
    const fake = join(dir, "fake-render");
    writeFileSync(
      fake,
      [
        "#!/usr/bin/env bash",
        'if [ "$1" = "--version" ]; then echo 9.9.9; exit 0; fi',
        'printf "<svg><text>Order</text></svg>" > "$3"',
        "",
      ].join("\n"),
    );
    chmodSync(fake, 0o755);
    const report = execFileSync(
      "bash",
      [join(ROOT, "scripts", "smoke_binary.sh"), fake, "9.9.9"],
      { encoding: "utf8" },
    );
    expect(report).toContain("smoke passed");
  });

  it("rejects an executable whose version does not match the build", () => {
    const dir = mkdtempSync(join(tmpdir(), "pr-smoke-"));
    const fake = join(dir, "stale-render");
    writeFileSync(fake, '#!/usr/bin/env bash\necho 0.0.1\n');
    chmodSync(fake, 0o755);
    expect(() =>
      execFileSync("bash", [join(ROOT, "scripts", "smoke_binary.sh"), fake, "9.9.9"], {
        encoding: "utf8",
        stdio: "pipe",
      }),
    ).toThrow();
  });
});
