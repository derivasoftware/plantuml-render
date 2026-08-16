import { describe, expect, it } from "vitest";

import { expandIncludes, type IncludeLoader } from "../src/render/preprocess.js";

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
