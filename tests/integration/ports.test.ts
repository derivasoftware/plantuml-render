import { describe, expect, it } from "vitest";

import { renderSvg } from "../../src/render/engine.js";
import { pumlToIr } from "../../src/render/frontend.js";
import { validateIr } from "../../src/render/ir.js";

const BLOCK = `@startuml control
class Source
class Controller <<block>> {
  + in ref : double
  + in y
  + out u
  - gain : double
  + step() : void
}
class Plant
Source --> Controller::ref
Plant --> Controller::y
Controller::u --> Plant
@enduml
`;

describe("boundary ports on a block", () => {
  it("reads in/out members as ports owned by the block", async () => {
    const ir = await pumlToIr(BLOCK);
    const ports = ir.nodes.filter((n) => n.kind === "port");
    expect(ports.map((p) => [p.id, p.label, p.direction])).toEqual([
      ["Controller.ref", "ref", "in"],
      ["Controller.y", "y", "in"],
      ["Controller.u", "u", "out"],
    ]);
    expect(ports.every((p) => p.parent === "Controller")).toBe(true);
    // A typed signal keeps its type as the tooltip, not on the border.
    expect(ports[0].title).toBe("ref : double");
    expect(ports[1].title).toBeUndefined();
  });

  it("leaves a block's other members in their compartments", async () => {
    const ir = await pumlToIr(BLOCK);
    const block = ir.nodes.find((n) => n.id === "Controller")!;
    expect(block.stereotype).toBe("block");
    expect(block.sections).toEqual([["- gain : double"], ["+ step() : void"]]);
    expect(block.sectionKinds).toEqual(["attributes", "methods"]);
  });

  it("resolves Block::port endpoints to the port node", async () => {
    const ir = await pumlToIr(BLOCK);
    expect(ir.edges).toEqual([
      { from: "Source", to: "Controller.ref", kind: "association", label: undefined },
      { from: "Plant", to: "Controller.y", kind: "association", label: undefined },
      { from: "Controller.u", to: "Plant", kind: "association", label: undefined },
    ]);
  });

  it("only applies to the block stereotype", async () => {
    const plain = await pumlToIr(
      "@startuml\nclass Filter {\n  + in x\n  + out y\n}\n@enduml\n",
    );
    expect(plain.nodes.filter((n) => n.kind === "port")).toEqual([]);
    expect(plain.nodes[0].sections).toEqual([["+ in x", "+ out y"]]);
    const other = await pumlToIr(
      "@startuml\nclass Filter <<entity>> {\n  + in x\n}\n@enduml\n",
    );
    expect(other.nodes.filter((n) => n.kind === "port")).toEqual([]);
  });

  it("validates against the render-IR schema", async () => {
    const ir = structuredClone(await pumlToIr(BLOCK));
    expect(() => validateIr(ir)).not.toThrow();
  });
});

describe("drawing a block with ports", () => {
  it("places each port on its block's border and sizes the block to fit", async () => {
    const svg = await renderSvg(await pumlToIr(BLOCK));
    const port = (id: string) => {
      const g = new RegExp(`<g id="[^"]*${id}" data-id="${id}"[^>]*>.*?<rect x="(\\d+)" y="(\\d+)" width="(\\d+)" height="(\\d+)"`, "s").exec(svg)!;
      return { x: +g[1], y: +g[2], w: +g[3], h: +g[4] };
    };
    const block = /<g id="[^"]*Controller" data-id="Controller"[^>]*>.*?<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/s.exec(svg)!;
    const [bx, by, bw, bh] = block.slice(1, 5).map(Number);

    const ref = port("Controller\\.ref");
    const y = port("Controller\\.y");
    const u = port("Controller\\.u");
    // Inputs on the west border, the output on the east one.
    expect(ref.x + ref.w).toBeLessThanOrEqual(bx + 1);
    expect(y.x + y.w).toBeLessThanOrEqual(bx + 1);
    expect(u.x).toBeGreaterThanOrEqual(bx + bw - 1);
    // Every port sits within the block's own height, which grew for them.
    for (const p of [ref, y, u]) {
      expect(p.y).toBeGreaterThanOrEqual(by);
      expect(p.y + p.h).toBeLessThanOrEqual(by + bh);
    }
    expect(ref.y).not.toBe(y.y);
  });

  it("marks outputs apart and draws the name clear of the wire", async () => {
    const svg = await renderSvg(await pumlToIr(BLOCK));
    expect(svg).toContain('data-id="Controller.u" class="pr-port pr-port-out"');
    expect(svg).toContain('data-id="Controller.ref" class="pr-port"');
    expect(svg).toContain('<title>ref : double</title>');
    // The name is drawn outside the border and above the square, clear of
    // both the wire that arrives and the block's own content.
    const u = /data-id="Controller\.u"[^>]*>(?:<title>[^<]*<\/title>)?<rect x="(\d+)" y="(\d+)" width="(\d+)"/.exec(svg)!;
    const label = /<text class="pr-port-label" x="(\d+)" y="(\d+)">u<\/text>/.exec(svg)!;
    expect(+label[1]).toBeGreaterThanOrEqual(+u[1] + +u[3]);
    expect(+label[2]).toBeLessThan(+u[2]);
    // A west port's name reads towards the block, so it ends at the square.
    expect(svg).toMatch(/<text class="pr-port-label" x="\d+" y="\d+" text-anchor="end">ref<\/text>/);
  });

  it("routes the wire to the port, not to the block's centre", async () => {
    const svg = await renderSvg(await pumlToIr(BLOCK));
    const ref = /<g id="[^"]*Controller\.ref"[^>]*>.*?<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/s.exec(svg)!;
    const [px, py, pw, ph] = ref.slice(1, 5).map(Number);
    const block = /<g id="[^"]*Controller" data-id="Controller"[^>]*>.*?<rect x="\d+" y="(\d+)" width="\d+" height="(\d+)"/s.exec(svg)!;
    const [by, bh] = block.slice(1, 3).map(Number);
    const wire = /<path class="pr-edge[^"]*" data-from="Source" data-to="Controller\.ref" d="([^"]+)"/.exec(svg)!;
    const points = wire[1].split(/[ML]\s*/).filter(Boolean).map((p) => p.split(",").map(Number));
    const [ex, ey] = points[points.length - 1];
    expect(Math.abs(ex - px)).toBeLessThanOrEqual(pw + 8);
    expect(Math.abs(ey - (py + ph / 2))).toBeLessThanOrEqual(ph);
    // A wire that ignored the port would end at the block's own border.
    expect(ey).not.toBe(by + bh / 2);
  });

  it("keeps the port names inside the canvas", async () => {
    const svg = await renderSvg(await pumlToIr(BLOCK));
    const [, vx, vy, vw, vh] = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg)!.map(Number);
    for (const m of svg.matchAll(/<text class="pr-port-label" x="([\d.]+)" y="([\d.]+)"/g)) {
      expect(+m[1]).toBeGreaterThan(vx);
      expect(+m[1]).toBeLessThan(vx + vw);
      expect(+m[2]).toBeGreaterThan(vy);
      expect(+m[2]).toBeLessThan(vy + vh);
    }
  });

  it("is byte-deterministic", async () => {
    const ir = await pumlToIr(BLOCK);
    expect(await renderSvg(ir)).toBe(await renderSvg(ir));
  });
});

const SUBSYSTEM = `@startuml plant
class Source
package Controller <<block>> {
  class target <<in>>
  class measured <<in>>
  class drive <<out>>
  class Error
  class Gain
  target --> Error
  measured --> Error
  Error --> Gain
  Gain --> drive
}
class Plant
Source --> Controller::target
Controller::drive --> Plant
Plant --> Controller::measured
@enduml
`;

describe("a container as a block", () => {
  it("reads <<in>>/<<out>> children of a block container as its ports", async () => {
    const ir = await pumlToIr(SUBSYSTEM);
    const kinds = new Map(ir.nodes.map((n) => [n.id, n.kind]));
    expect(kinds.get("Controller")).toBe("container");
    expect(kinds.get("Controller.target")).toBe("port");
    expect(kinds.get("Controller.drive")).toBe("port");
    // Children without the marker stay what they are.
    expect(kinds.get("Controller.Gain")).toBe("box");
    const ports = ir.nodes.filter((n) => n.kind === "port");
    expect(ports.map((p) => p.direction)).toEqual(["in", "in", "out"]);
    expect(ports.every((p) => p.parent === "Controller")).toBe(true);
    expect(ir.nodes.find((n) => n.id === "Controller")?.stereotype).toBe("block");
  });

  it("wires the inside and the outside to the same ports", async () => {
    const ir = await pumlToIr(SUBSYSTEM);
    const wires = ir.edges.map((e) => `${e.from}->${e.to}`);
    expect(wires).toContain("Source->Controller.target");
    expect(wires).toContain("Controller.target->Controller.Error");
    expect(wires).toContain("Controller.Gain->Controller.drive");
    expect(wires).toContain("Controller.drive->Plant");
  });

  it("only applies inside a block container", async () => {
    const plain = await pumlToIr(
      "@startuml\npackage P {\n  class a <<in>>\n}\n@enduml\n",
    );
    expect(plain.nodes.filter((n) => n.kind === "port")).toEqual([]);
    expect(plain.nodes.find((n) => n.id === "P.a")?.stereotype).toBe("in");
    const nested = await pumlToIr(
      "@startuml\npackage A.B <<block>> {\n  class a <<in>>\n}\n@enduml\n",
    );
    // The stereotype belongs to the declared container, not to the box the
    // dotted name opened on the way there.
    expect(nested.nodes.find((n) => n.id === "A")?.stereotype).toBeUndefined();
    expect(nested.nodes.find((n) => n.id === "A.B")?.stereotype).toBe("block");
    expect(nested.nodes.find((n) => n.id === "A.B.a")?.kind).toBe("port");
  });

  it("draws the ports on the container border and routes both sides to them", async () => {
    const svg = await renderSvg(await pumlToIr(SUBSYSTEM));
    const rect = (id: string) => {
      const m = new RegExp(`data-id="${id}"[^>]*>(?:<title>[^<]*</title>)?<rect x="(\\d+)" y="(\\d+)" width="(\\d+)" height="(\\d+)"`).exec(svg)!;
      return { x: +m[1], y: +m[2], w: +m[3], h: +m[4] };
    };
    const box = rect("Controller");
    const target = rect("Controller.target");
    const drive = rect("Controller.drive");
    expect(target.x + target.w).toBeLessThanOrEqual(box.x + 1);
    expect(drive.x).toBeGreaterThanOrEqual(box.x + box.w - 1);

    const end = (from: string, to: string) => {
      const m = new RegExp(`data-from="${from}" data-to="${to}" d="([^"]+)"`).exec(svg)!;
      const pts = m[1].split(/[ML]\s*/).filter(Boolean).map((p) => p.split(",").map(Number));
      return { first: pts[0], last: pts[pts.length - 1] };
    };
    // The outside arrives at the port, and the inside leaves from it: both
    // are drawn in the same place, which is what makes the boundary read.
    const inbound = end("Source", "Controller\\.target").last;
    const onward = end("Controller\\.target", "Controller\\.Error").first;
    expect(Math.abs(inbound[0] - onward[0])).toBeLessThanOrEqual(target.w + 2);
    expect(Math.abs(inbound[1] - onward[1])).toBeLessThanOrEqual(target.h + 2);
  });
});

describe("one output driving several destinations", () => {
  const FANOUT = `@startuml fanout
package System <<block>> {
  class in1 <<in>>
  class out1 <<out>>
  class Source <<block>> {
    + in u
    + out y
  }
  class ConsumerA
  class ConsumerB
  class ConsumerC
  in1 --> Source::u
  Source::y --> ConsumerA
  Source::y --> ConsumerB
  Source::y --> ConsumerC
  ConsumerA --> out1
}
@enduml
`;

  it("starts every wire of a fan-out at the one port they share", async () => {
    const svg = await renderSvg(await pumlToIr(FANOUT));
    const starts = [...svg.matchAll(/data-from="System\.Source\.y" data-to="[^"]+" d="M([\d.]+),([\d.]+)/g)]
      .map((m) => `${m[1]},${m[2]}`);
    expect(starts).toHaveLength(3);
    // One output, three consumers: the drawing must not read as three outputs.
    expect(new Set(starts).size).toBe(1);
  });

  it("without the port, each wire leaves the box at its own place", async () => {
    const plain = FANOUT.replace(/class Source <<block>> \{[^}]*\}/s, "class Source").replace(/Source::[uy]/g, "Source");
    const svg = await renderSvg(await pumlToIr(plain));
    const starts = [...svg.matchAll(/data-from="System\.Source" data-to="[^"]+" d="M([\d.]+),([\d.]+)/g)]
      .map((m) => `${m[1]},${m[2]}`);
    expect(starts).toHaveLength(3);
    expect(new Set(starts).size).toBeGreaterThan(1);
  });
});

describe("which way a block diagram flows", () => {
  const chain = (ports: string) => `@startuml chain
package Sub <<block>> {
${ports}
  class First
  class Second
  class Third
  First --> Second
  Second --> Third
}
@enduml
`;

  const centres = async (src: string, ids: string[]) => {
    const svg = await renderSvg(await pumlToIr(src));
    return ids.map((id) => {
      const m = new RegExp(`data-id="${id}"[^>]*>(?:<title>[^<]*</title>)?<rect x="(\\d+)" y="(\\d+)" width="(\\d+)" height="(\\d+)"`).exec(svg)!;
      return { x: +m[1] + +m[3] / 2, y: +m[2] + +m[4] / 2 };
    });
  };

  it("runs the chain left to right when the ports are on the sides", async () => {
    const [a, b, c] = await centres(chain("  class i <<in>>\n  class o <<out>>"), [
      "Sub.First",
      "Sub.Second",
      "Sub.Third",
    ]);
    expect(a.x).toBeLessThan(b.x);
    expect(b.x).toBeLessThan(c.x);
  });

  it("keeps a diagram without ports flowing downwards", async () => {
    const [a, b, c] = await centres(chain(""), ["Sub.First", "Sub.Second", "Sub.Third"]);
    expect(a.y).toBeLessThan(b.y);
    expect(b.y).toBeLessThan(c.y);
  });

  it("follows the border the ports actually use", async () => {
    // North and south ports say the signal runs down the page, and only the
    // IR can say so: the text syntax states direction, not side.
    const ir = await pumlToIr(chain("  class i <<in>>\n  class o <<out>>"));
    for (const node of ir.nodes) {
      if (node.kind === "port") node.side = node.direction === "out" ? "south" : "north";
    }
    const svg = await renderSvg(ir);
    const at = (id: string) => {
      const m = new RegExp(`data-id="${id}"[^>]*>(?:<title>[^<]*</title>)?<rect x="(\\d+)" y="(\\d+)"`).exec(svg)!;
      return { x: +m[1], y: +m[2] };
    };
    expect(at("Sub.First").y).toBeLessThan(at("Sub.Third").y);
  });
});

describe("outlines", () => {
  it("draws a box and a container in colours a large diagram keeps", async () => {
    const svg = await renderSvg(await pumlToIr("@startuml\npackage P {\n  class A\n}\n@enduml\n"));
    // The box takes the grey the edges use, the container the one the box
    // had: both survive a diagram scaled down to fit a page.
    expect(svg).toContain("--pr-stroke: #64748b");
    expect(svg).toContain("--pr-container-stroke: #94a3b8");
    // Dark mode goes lighter, for contrast against a dark fill.
    expect(svg).toContain("--pr-stroke: #94a3b8; --pr-edge: #94a3b8; --pr-box-fill: #1e293b");
    expect(svg).toContain("--pr-container-stroke: #64748b");
  });
});

describe("a large block diagram stays legible", () => {
  const chained = (n: number) => {
    const out: string[] = ["@startuml big"];
    for (let s = 1; s <= n; s++) {
      out.push(`package Sub${s} <<block>> {`, `  class i${s} <<in>>`, `  class o${s} <<out>>`);
      for (const k of "ABCDE") out.push(`  class B${s}${k}`);
      out.push(`  i${s} --> B${s}A`);
      for (let j = 0; j < 4; j++) out.push(`  B${s}${"ABCD"[j]} --> B${s}${"BCDE"[j]}`);
      out.push(`  B${s}E --> o${s}`, "}");
    }
    for (let s = 1; s < n; s++) out.push(`Sub${s}::o${s} --> Sub${s + 1}::i${s + 1}`);
    out.push("@enduml");
    return out.join("\n");
  };

  const shape = async (src: string) => {
    const svg = await renderSvg(await pumlToIr(src));
    const [, , , w, h] = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg)!.map(Number);
    return { w, h, ratio: w / h };
  };

  it("wraps a long chain instead of drawing one endless row", async () => {
    // Six subsystems in a row are 26 times wider than tall; shown scaled to
    // fit, the boxes are a few pixels high and their outlines dissolve.
    const { ratio } = await shape(chained(6));
    expect(ratio).toBeLessThan(5);
  });

  it("grows a long chain in both directions, not only sideways", async () => {
    const two = await shape(chained(2));
    const six = await shape(chained(6));
    expect(six.h).toBeGreaterThan(two.h);
    expect(six.w / two.w).toBeLessThan(3);
  });

  it("keeps the outlines at the width they were drawn, whatever the zoom", async () => {
    const svg = await renderSvg(await pumlToIr("@startuml\npackage P {\n  class A\n}\n@enduml\n"));
    expect(svg).toContain("vector-effect: non-scaling-stroke");
  });
});
