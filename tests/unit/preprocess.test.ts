// @covers render.preprocess.expandIncludes, render.preprocess.loadFragment, render.preprocess.loadWhole
import { describe, expect, it } from "vitest";

import { expandIncludes, type IncludeLoader, loadFragment, loadWhole } from "../../src/render/preprocess.js";

const FILES: Record<string, string> = {
  "/d/CL_Leaf.puml": `@startuml CL_Leaf
!startsub Kernel
namespace core {
  class Kernel
}
!endsub
!startsub Aux
class Aux
!endsub
@enduml
`,
  "/d/CL_Deep.puml": `@startuml
!startsub Deep
!includesub ./CL_Leaf.puml!Aux
!endsub
@enduml
`,
  "/d/style.iuml": "skinparam monochrome true\n",
};

const loader: IncludeLoader = {
  read: (path) => FILES[path] ?? null,
  resolve: (base, rel) => `${base}/${rel.replace(/^\.\//, "")}`,
  dirname: (path) => path.slice(0, path.lastIndexOf("/")),
};

describe("expandIncludes", () => {
  it("inlines a named fragment", async () => {
    const out = await expandIncludes(
      "!includesub ./CL_Leaf.puml!Kernel", "/d", loader,
    );
    expect(out).toContain("class Kernel");
    expect(out).not.toContain("Aux");
  });

  it("expands nested includesub chains", async () => {
    const out = await expandIncludes(
      "!includesub ./CL_Deep.puml!Deep", "/d", loader,
    );
    expect(out).toContain("class Aux");
  });

  it("inlines whole files dropping the envelope", async () => {
    const out = await expandIncludes("!include ./style.iuml", "/d", loader);
    expect(out).toBe("skinparam monochrome true\n");
  });

  it("keeps unresolvable directives verbatim and cuts cycles", async () => {
    const cyclic: IncludeLoader = {
      ...loader,
      read: (p) =>
        p === "/d/a.puml" ? "!startsub S\n!includesub ./a.puml!S\n!endsub\n" : null,
    };
    expect(await expandIncludes("!includesub ./missing.puml!X", "/d", loader)).toBe(
      "!includesub ./missing.puml!X",
    );
    const out = await expandIncludes("!includesub ./a.puml!S", "/d", cyclic);
    expect(out).toBe("");
  });
});

describe("expandIncludes on plain text", () => {
  it("leaves lines that are not directives as they are, blank lines and envelope included", async () => {
    const source = "@startuml\n\n  class A\n!includesub broken\n@enduml\n";
    expect(await expandIncludes(source, "/d", loader)).toBe(source);
  });

  it("recognises an indented directive", async () => {
    expect(await expandIncludes("  !include ./style.iuml  ", "/d", loader)).toBe("skinparam monochrome true\n");
  });

  it("keeps the lines around an expansion in place", async () => {
    const out = await expandIncludes("before\n!include ./style.iuml\nafter", "/d", loader);
    expect(out).toBe("before\nskinparam monochrome true\n\nafter");
  });

  it("keeps an unreadable !include verbatim", async () => {
    expect(await expandIncludes("!include ./missing.puml", "/d", loader)).toBe("!include ./missing.puml");
  });

  it("resolves a directive against the base it is given", async () => {
    const resolved: [string, string][] = [];
    await expandIncludes("!include ./x.puml", "/somewhere", {
      ...loader,
      resolve: (base, rel) => {
        resolved.push([base, rel]);
        return `${base}/${rel}`;
      },
    });
    expect(resolved).toEqual([["/somewhere", "./x.puml"]]);
  });

  it("waits for a loader that reads asynchronously", async () => {
    const out = await expandIncludes("!include ./style.iuml", "/d", {
      ...loader,
      read: async (path) => FILES[path] ?? null,
    });
    expect(out).toBe("skinparam monochrome true\n");
  });
});

describe("loadWhole", () => {
  it("returns the file without its envelope lines", async () => {
    const files: IncludeLoader = {
      ...loader,
      read: () => "@startuml name\nclass A\n  @enduml\n",
    };
    expect(await loadWhole("/d/a.puml", files, new Set())).toBe("class A\n");
  });

  it("is null for an unreadable file", async () => {
    expect(await loadWhole("/d/missing.puml", loader, new Set())).toBeNull();
  });

  it("records the path it visited", async () => {
    const seen = new Set<string>();
    await loadWhole("/d/style.iuml", loader, seen);
    expect([...seen]).toEqual(["/d/style.iuml"]);
  });

  it("returns nothing, without reading, for a path already visited", async () => {
    const reads: string[] = [];
    const counting: IncludeLoader = {
      ...loader,
      read: (path) => {
        reads.push(path);
        return "class A";
      },
    };
    expect(await loadWhole("/d/a.puml", counting, new Set(["/d/a.puml"]))).toBe("");
    expect(reads).toEqual([]);
  });

  it("expands nested directives relative to the file's own directory", async () => {
    const nested: IncludeLoader = {
      ...loader,
      read: (path) =>
        ({ "/d/sub/a.puml": "!include ./b.puml", "/d/sub/b.puml": "class B" })[path] ?? null,
    };
    expect(await loadWhole("/d/sub/a.puml", nested, new Set())).toBe("class B");
  });

  it("cuts a file that includes itself", async () => {
    const cyclic: IncludeLoader = { ...loader, read: () => "class A\n!include ./a.puml" };
    expect(await loadWhole("/d/a.puml", cyclic, new Set())).toBe("class A\n");
  });
});

describe("loadFragment", () => {
  it("returns only the lines of the named fragment, without its markers", async () => {
    const out = await loadFragment("/d/CL_Leaf.puml", "Aux", loader, new Set());
    expect(out).toBe("class Aux");
  });

  it("joins every block carrying the name", async () => {
    const split: IncludeLoader = {
      ...loader,
      read: () => "!startsub S\none\n!endsub\nout\n!startsub S\ntwo\n!endsub",
    };
    expect(await loadFragment("/d/a.puml", "S", split, new Set())).toBe("one\ntwo");
  });

  it("ends a fragment at the next !startsub, even without !endsub", async () => {
    const open: IncludeLoader = {
      ...loader,
      read: () => "!startsub S\none\n!startsub T\ntwo\n!endsub",
    };
    expect(await loadFragment("/d/a.puml", "S", open, new Set())).toBe("one");
  });

  it("is null for an unreadable file", async () => {
    expect(await loadFragment("/d/missing.puml", "S", loader, new Set())).toBeNull();
  });

  it("is null when the file has no fragment of that name", async () => {
    expect(await loadFragment("/d/CL_Leaf.puml", "Nope", loader, new Set())).toBeNull();
  });

  it("records the visit under file and fragment together", async () => {
    const seen = new Set<string>();
    await loadFragment("/d/CL_Leaf.puml", "Aux", loader, seen);
    expect([...seen]).toEqual(["/d/CL_Leaf.puml!Aux"]);
  });

  it("does not take another fragment of the same file as already visited", async () => {
    const seen = new Set(["/d/CL_Leaf.puml!Aux"]);
    expect(await loadFragment("/d/CL_Leaf.puml", "Kernel", loader, seen)).toContain("class Kernel");
  });

  it("returns nothing, without reading, for a fragment already visited", async () => {
    const reads: string[] = [];
    const counting: IncludeLoader = {
      ...loader,
      read: (path) => {
        reads.push(path);
        return null;
      },
    };
    expect(await loadFragment("/d/a.puml", "S", counting, new Set(["/d/a.puml!S"]))).toBe("");
    expect(reads).toEqual([]);
  });

  it("expands nested directives relative to the file's own directory", async () => {
    expect(await loadFragment("/d/CL_Deep.puml", "Deep", loader, new Set())).toBe("class Aux");
  });
});
