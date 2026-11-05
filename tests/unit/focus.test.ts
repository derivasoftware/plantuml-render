// @covers render.focus.attachFocus, render.focus.attr, render.focus.labelOf, render.focus.neighbourhood
// @covers render.focus.nodeOf, render.focus.relations, render.focus.titleOf
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  attachFocus,
  attr,
  type DomElement,
  type DomRoot,
  type Focused,
  labelOf,
  neighbourhood,
  nodeOf,
  relations,
  titleOf,
} from "../../src/render/focus.js";

/**
 * The project has no DOM (the package compiles without the DOM library and no
 * DOM implementation is installed), so this is the slice `DomElement` declares,
 * with real tree semantics. A selector the code starts using that this stub
 * does not know throws rather than matching nothing.
 */
class Stub implements DomElement {
  readonly classes = new Set<string>();
  parent: Stub | null = null;

  constructor(
    readonly tag: string,
    readonly attrs: Record<string, string> = {},
    readonly children: Stub[] = [],
    readonly text = "",
  ) {
    for (const child of children) child.parent = this;
    for (const cls of (attrs.class ?? "").split(" ").filter(Boolean)) this.classes.add(cls);
  }

  readonly classList = {
    add: (...tokens: string[]) => tokens.forEach((t) => this.classes.add(t)),
    remove: (...tokens: string[]) => tokens.forEach((t) => this.classes.delete(t)),
  };

  get textContent(): string {
    return this.text + this.children.map((c) => c.textContent).join("");
  }

  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }

  private descendants(): Stub[] {
    return this.children.flatMap((c) => [c, ...c.descendants()]);
  }

  private matchesOne(selector: string): boolean {
    const byAttr = /^\[([\w-]+)(?:="((?:[^"\\]|\\.)*)")?\]$/.exec(selector);
    if (byAttr) {
      const value = this.getAttribute(byAttr[1]);
      if (byAttr[2] === undefined) return value !== null;
      return value === byAttr[2].replace(/\\(.)/g, "$1");
    }
    const byTag = /^(\w+)(?::not\(\.([\w-]+)\))?$/.exec(selector);
    if (byTag) return this.tag === byTag[1] && !(byTag[2] && this.classes.has(byTag[2]));
    throw new Error(`stub does not know the selector ${selector}`);
  }

  private matches(selectors: string): boolean {
    return selectors.split(/,\s*/).some((s) => this.matchesOne(s));
  }

  querySelectorAll(selectors: string): Stub[] {
    const scoped = /^:scope > (.+)$/.exec(selectors);
    if (scoped) return this.children.filter((c) => c.matches(scoped[1]));
    return this.descendants().filter((d) => d.matches(selectors));
  }

  querySelector(selectors: string): Stub | null {
    return this.querySelectorAll(selectors)[0] ?? null;
  }

  closest(selectors: string): Stub | null {
    for (let cur: Stub | null = this; cur; cur = cur.parent) if (cur.matches(selectors)) return cur;
    return null;
  }
}

type Listener = (event: { target: unknown }) => void;

class RootStub extends Stub implements DomRoot {
  readonly listeners: Record<string, Set<Listener>> = { mousemove: new Set(), mouseleave: new Set() };

  addEventListener(type: "mousemove" | "mouseleave", listener: Listener): void {
    this.listeners[type].add(listener);
  }

  removeEventListener(type: "mousemove" | "mouseleave", listener: Listener): void {
    this.listeners[type].delete(listener);
  }

  fire(type: "mousemove" | "mouseleave", target: unknown): void {
    for (const listener of this.listeners[type]) listener({ target });
  }
}

const title = (text: string) => new Stub("title", {}, [], text);
const label = (text: string, cls?: string) => new Stub("text", cls ? { class: cls } : {}, [], text);
const node = (id: string, ...children: Stub[]) => new Stub("g", { "data-id": id }, children);
const edge = (from: string, to: string, ...children: Stub[]) =>
  new Stub("g", { "data-from": from, "data-to": to }, children);

/** A → B → C, and D touching nothing. */
function drawing() {
  const inner = label("Alpha");
  const a = node("A", title("first node"), inner);
  const b = node("B", title("second node"), label("Beta"));
  const c = node("C", label("Gamma"));
  const d = node("D", label("Delta"));
  const ab = edge("A", "B", title("a uses b"));
  const bc = edge("B", "C");
  const outside = new Stub("rect");
  const svg = new RootStub("svg", {}, [a, b, c, d, ab, bc, outside]);
  return { svg, a, b, c, d, ab, bc, inner, outside };
}

const FOCUS_CLASSES = ["pr-focus", "pr-focus-root"];
const litOf = (...els: Stub[]) => els.filter((el) => el.classes.has("pr-focus"));

describe("attr", () => {
  it("builds an attribute selector", () => {
    expect(attr("data-id", "core.Kernel")).toBe('[data-id="core.Kernel"]');
  });

  it("escapes the quote and the backslash, which could end the string early", () => {
    expect(attr("data-id", 'a"b\\c')).toBe('[data-id="a\\"b\\\\c"]');
  });
});

describe("titleOf", () => {
  it("reads the element's own title", () => {
    expect(titleOf(node("A", title("words")))).toBe("words");
  });

  it("is empty for a missing element or one with no title", () => {
    expect(titleOf(null)).toBe("");
    expect(titleOf(node("A"))).toBe("");
  });

  it("ignores a title belonging to a descendant", () => {
    expect(titleOf(node("A", node("nested", title("not mine"))))).toBe("");
  });
});

describe("nodeOf", () => {
  it("finds the node carrying the id", () => {
    const { svg, b } = drawing();
    expect(nodeOf(svg, "B")).toBe(b);
  });

  it("is null when no node carries it", () => {
    expect(nodeOf(drawing().svg, "nope")).toBeNull();
  });

  it("finds an id holding a quote", () => {
    const tricky = node('we"ird');
    expect(nodeOf(new Stub("svg", {}, [tricky]), 'we"ird')).toBe(tricky);
  });
});

describe("labelOf", () => {
  it("is the node's drawn text, trimmed", () => {
    const svg = new Stub("svg", {}, [node("A", label("  Alpha \n"))]);
    expect(labelOf(svg, "A")).toBe("Alpha");
  });

  it("skips port labels", () => {
    const svg = new Stub("svg", {}, [node("A", label("in", "pr-port-label"), label("Alpha"))]);
    expect(labelOf(svg, "A")).toBe("Alpha");
  });

  it("falls back to the id without a node, without text, or with blank text", () => {
    const svg = new Stub("svg", {}, [node("bare"), node("blank", label("   "))]);
    expect(labelOf(svg, "missing")).toBe("missing");
    expect(labelOf(svg, "bare")).toBe("bare");
    expect(labelOf(svg, "blank")).toBe("blank");
  });
});

describe("relations", () => {
  it("lists what carries a data-from, in document order, and no node", () => {
    const { svg, ab, bc } = drawing();
    expect(relations(svg)).toEqual([ab, bc]);
  });

  it("is empty on a drawing with no relation", () => {
    expect(relations(new Stub("svg", {}, [node("A")]))).toEqual([]);
  });
});

describe("neighbourhood", () => {
  it("reports both directions, with the relation's words on each link", () => {
    const { svg } = drawing();
    const hood = neighbourhood(svg, "B");
    expect(hood.id).toBe("B");
    expect(hood.label).toBe("Beta");
    expect(hood.says).toBe("second node");
    expect(hood.incoming).toEqual([{ id: "A", label: "Alpha", says: "a uses b" }]);
    expect(hood.outgoing).toEqual([{ id: "C", label: "Gamma", says: "" }]);
  });

  it("lists neighbours with the words of the node, not of the relation", () => {
    const { svg } = drawing();
    expect(neighbourhood(svg, "B").neighbours).toEqual([
      { id: "A", label: "Alpha", says: "first node" },
      { id: "C", label: "Gamma", says: "" },
    ]);
  });

  it("lists a node reached twice once among neighbours, but keeps both relations", () => {
    const svg = new Stub("svg", {}, [
      node("A"),
      node("B"),
      edge("A", "B", title("one")),
      edge("B", "A", title("two")),
      edge("A", "B", title("three")),
    ]);
    const hood = neighbourhood(svg, "A");
    expect(hood.outgoing.map((l) => l.says)).toEqual(["one", "three"]);
    expect(hood.incoming.map((l) => l.says)).toEqual(["two"]);
    expect(hood.neighbours.map((l) => l.id)).toEqual(["B"]);
  });

  it("counts a self-relation in both directions", () => {
    const svg = new Stub("svg", {}, [node("A"), edge("A", "A")]);
    const hood = neighbourhood(svg, "A");
    expect(hood.incoming.map((l) => l.id)).toEqual(["A"]);
    expect(hood.outgoing.map((l) => l.id)).toEqual(["A"]);
    expect(hood.neighbours.map((l) => l.id)).toEqual(["A"]);
  });

  it("is empty for a node touching nothing, and for an id not in the drawing", () => {
    const { svg } = drawing();
    expect(neighbourhood(svg, "D")).toEqual({
      id: "D",
      label: "Delta",
      says: "",
      incoming: [],
      outgoing: [],
      neighbours: [],
    });
    expect(neighbourhood(svg, "ghost")).toEqual({
      id: "ghost",
      label: "ghost",
      says: "",
      incoming: [],
      outgoing: [],
      neighbours: [],
    });
  });
});

describe("attachFocus", () => {
  let d: ReturnType<typeof drawing>;
  let all: Stub[];
  let onFocus: ReturnType<typeof vi.fn<(focused: Focused | null) => void>>;

  beforeEach(() => {
    d = drawing();
    all = [d.a, d.b, d.c, d.d, d.ab, d.bc];
    onFocus = vi.fn<(focused: Focused | null) => void>();
  });

  it("listens to the pointer on the root and changes nothing until it moves", () => {
    attachFocus(d.svg, { onFocus });
    expect(d.svg.listeners.mousemove.size).toBe(1);
    expect(d.svg.listeners.mouseleave.size).toBe(1);
    expect(d.svg.classes.has("pr-focusing")).toBe(false);
    expect(litOf(...all)).toEqual([]);
    expect(onFocus).not.toHaveBeenCalled();
  });

  it("on a node, lights it, its relations and the nodes one hop away, no further", () => {
    attachFocus(d.svg, { onFocus });
    d.svg.fire("mousemove", d.a);
    expect(litOf(...all)).toEqual([d.a, d.b, d.ab]);
    expect(d.c.classes.has("pr-focus")).toBe(false);
    expect(d.bc.classes.has("pr-focus")).toBe(false);
    expect(d.svg.classes.has("pr-focusing")).toBe(true);
  });

  it("marks only the one pointed at as the root of the focus", () => {
    attachFocus(d.svg);
    d.svg.fire("mousemove", d.b);
    expect(all.filter((el) => el.classes.has("pr-focus-root"))).toEqual([d.b]);
    expect(litOf(...all)).toEqual([d.a, d.b, d.c, d.ab, d.bc]);
  });

  it("reaches the owning node from something inside it", () => {
    attachFocus(d.svg, { onFocus });
    d.svg.fire("mousemove", d.inner);
    expect(d.a.classes.has("pr-focus-root")).toBe(true);
    expect(d.inner.classes.has("pr-focus")).toBe(false);
    expect(onFocus.mock.calls[0][0]?.element).toBe(d.a);
  });

  it("reports a node's neighbourhood", () => {
    attachFocus(d.svg, { onFocus });
    d.svg.fire("mousemove", d.b);
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onFocus).toHaveBeenCalledWith({ element: d.b, node: neighbourhood(d.svg, "B") });
  });

  it("on a relation, lights it and its two ends only", () => {
    attachFocus(d.svg);
    d.svg.fire("mousemove", d.ab);
    expect(litOf(...all)).toEqual([d.a, d.b, d.ab]);
    expect(d.ab.classes.has("pr-focus-root")).toBe(true);
    expect(d.a.classes.has("pr-focus-root")).toBe(false);
  });

  it("reports a relation's two ends and its words", () => {
    attachFocus(d.svg, { onFocus });
    d.svg.fire("mousemove", d.ab);
    expect(onFocus).toHaveBeenCalledWith({
      element: d.ab,
      relation: {
        from: { id: "A", label: "Alpha", says: "first node" },
        to: { id: "B", label: "Beta", says: "second node" },
        says: "a uses b",
      },
    });
  });

  it("does nothing more while the pointer stays on the same element", () => {
    attachFocus(d.svg, { onFocus });
    d.svg.fire("mousemove", d.a);
    d.svg.fire("mousemove", d.inner);
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it("moves the light when the pointer moves to another element", () => {
    attachFocus(d.svg, { onFocus });
    d.svg.fire("mousemove", d.a);
    d.svg.fire("mousemove", d.c);
    expect(litOf(...all)).toEqual([d.b, d.c, d.bc]);
    expect(d.a.classes.has("pr-focus-root")).toBe(false);
    expect(d.svg.classes.has("pr-focusing")).toBe(true);
    expect(onFocus).toHaveBeenCalledTimes(2);
  });

  it("clears and reports null when the pointer moves onto nothing", () => {
    attachFocus(d.svg, { onFocus });
    d.svg.fire("mousemove", d.a);
    d.svg.fire("mousemove", d.outside);
    expect(litOf(...all)).toEqual([]);
    expect(d.svg.classes.has("pr-focusing")).toBe(false);
    expect(onFocus).toHaveBeenLastCalledWith(null);
  });

  it("stays silent moving over nothing when nothing is lit", () => {
    attachFocus(d.svg, { onFocus });
    d.svg.fire("mousemove", d.outside);
    d.svg.fire("mousemove", null);
    expect(onFocus).not.toHaveBeenCalled();
  });

  it("clears and reports null when the pointer leaves the root", () => {
    attachFocus(d.svg, { onFocus });
    d.svg.fire("mousemove", d.b);
    d.svg.fire("mouseleave", d.svg);
    for (const el of all) for (const cls of FOCUS_CLASSES) expect(el.classes.has(cls)).toBe(false);
    expect(d.svg.classes.has("pr-focusing")).toBe(false);
    expect(onFocus).toHaveBeenLastCalledWith(null);
  });

  it("works without options", () => {
    attachFocus(d.svg);
    d.svg.fire("mousemove", d.a);
    expect(d.a.classes.has("pr-focus")).toBe(true);
    d.svg.fire("mouseleave", d.svg);
    expect(d.a.classes.has("pr-focus")).toBe(false);
  });

  it("returns the function that removes the listeners and the light", () => {
    const detach = attachFocus(d.svg, { onFocus });
    d.svg.fire("mousemove", d.a);
    detach();
    expect(d.svg.listeners.mousemove.size).toBe(0);
    expect(d.svg.listeners.mouseleave.size).toBe(0);
    expect(litOf(...all)).toEqual([]);
    expect(d.svg.classes.has("pr-focusing")).toBe(false);
    expect(onFocus).toHaveBeenLastCalledWith(null);
  });
});
