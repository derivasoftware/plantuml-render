import { describe, expect, it, vi } from "vitest";

import { renderSvg } from "../../src/render/engine.js";
import { attachFocus, neighbourhood } from "../../src/render/focus.js";

/**
 * A DOM small enough to run the two functions against a real SVG string:
 * attributes, classes, titles and the tree. Enough to prove the walk and the
 * classes, which is what the host depends on.
 */
function parse(svg: string) {
  interface El {
    tag: string;
    attrs: Record<string, string>;
    children: El[];
    text: string;
    classes: Set<string>;
    parent?: El;
  }
  const root: El = { tag: "svg", attrs: {}, children: [], text: "", classes: new Set() };
  const stack: El[] = [root];
  const token = /<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>|([^<]+)/g;
  for (const m of svg.matchAll(token)) {
    if (m[5] !== undefined) {
      stack[stack.length - 1].text += m[5];
      continue;
    }
    if (m[1]) { if (stack.length > 1) stack.pop(); continue; }
    const attrs: Record<string, string> = {};
    for (const a of m[3].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    const el: El = { tag: m[2], attrs, children: [], text: "", classes: new Set((attrs.class ?? "").split(" ").filter(Boolean)), parent: stack[stack.length - 1] };
    stack[stack.length - 1].children.push(el);
    if (!m[4]) stack.push(el);
  }
  const all = (el: El): El[] => [el, ...el.children.flatMap(all)];

  // A real DOM hands back the same node object every time, and the code
  // under test compares elements by identity, so the fake has to as well.
  const wrappers = new Map<El, any>();
  const wrap = (el: El): any => wrappers.get(el) ?? wrappers.set(el, make(el)).get(el);
  const make = (el: El): any => ({
    _el: el,
    getAttribute: (n: string) => el.attrs[n] ?? null,
    get textContent() { return el.text; },
    get classList() {
      return { add: (...t: string[]) => t.forEach((x) => el.classes.add(x)), remove: (...t: string[]) => t.forEach((x) => el.classes.delete(x)) };
    },
    querySelector: (sel: string) => (wrap as any).find(el, sel)[0] ?? null,
    querySelectorAll: (sel: string) => (wrap as any).find(el, sel),
    closest: (sel: string) => {
      for (let cur: El | undefined = el; cur; cur = cur.parent) {
        if ((wrap as any).matches(cur, sel)) return wrap(cur);
      }
      return null;
    },
  });
  (wrap as any).matches = (el: El, sel: string): boolean =>
    sel.split(",").map((s) => s.trim()).some((one) => {
      if (one.startsWith("[")) {
        // One or more attribute selectors in a row, all of which must hold.
        const parts = [...one.matchAll(/\[([\w-]+)(?:="((?:[^"\\]|\\.)*)")?\]/g)];
        return parts.length > 0 && parts.every(
          (m) => el.attrs[m[1]] !== undefined && (m[2] === undefined || el.attrs[m[1]] === m[2].replace(/\\(.)/g, "$1")),
        );
      }
      if (one.startsWith(":scope > ")) return false;
      const [tag, ...rest] = one.split(":not");
      return el.tag === tag && (!rest.length || !el.classes.has(rest[0].replace(/[().]/g, "")));
    });
  (wrap as any).find = (el: El, sel: string): any[] => {
    if (sel.startsWith(":scope > ")) {
      const want = sel.slice(":scope > ".length);
      return el.children.filter((c) => c.tag === want).map(wrap);
    }
    return all(el).slice(1).filter((c) => (wrap as any).matches(c, sel)).map(wrap);
  };

  const r = wrap(root);
  const listeners: Record<string, ((e: { target: unknown }) => void)[]> = {};
  r.addEventListener = (type: string, fn: (e: { target: unknown }) => void) => {
    (listeners[type] ??= []).push(fn);
  };
  r.removeEventListener = (type: string, fn: unknown) => {
    listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
  };
  r.fire = (type: string, target: unknown) => {
    for (const fn of listeners[type] ?? []) fn({ target });
  };
  r.lit = (cls: string) =>
    all(root).filter((el) => el.classes.has(cls)).map((el) => el.attrs["data-id"] ?? `${el.attrs["data-from"]}->${el.attrs["data-to"]}`);
  r.rootHas = (cls: string) => root.classes.has(cls);
  return r;
}

const MACHINE = {
  ir: 1 as const,
  nodes: [
    { id: "Idle", kind: "action" as const, label: "Idle", title: "Reposo" },
    { id: "Run", kind: "action" as const, label: "Running", title: "En marcha" },
    { id: "Err", kind: "action" as const, label: "Fault", title: "Fallo" },
  ],
  edges: [
    { from: "Idle", to: "Run", kind: "flow" as const, label: "start", title: "ev1 [g1]" },
    { from: "Run", to: "Idle", kind: "flow" as const, label: "stop", title: "stop [listo]" },
    { from: "Run", to: "Err", kind: "flow" as const, label: "error", title: "watchdog" },
  ],
};

describe("what a node touches", () => {
  it("answers from the drawing alone, with the words it carries", async () => {
    const svg = parse(await renderSvg(MACHINE));
    const n = neighbourhood(svg, "Run");
    expect(n.label).toBe("Running");
    expect(n.says).toBe("En marcha");
    expect(n.incoming.map((l) => [l.label, l.says])).toEqual([["Idle", "ev1 [g1]"]]);
    expect(n.outgoing.map((l) => [l.label, l.says])).toEqual([
      ["Idle", "stop [listo]"],
      ["Fault", "watchdog"],
    ]);
  });

  it("names every neighbour once, with its own explanation", async () => {
    const svg = parse(await renderSvg(MACHINE));
    const n = neighbourhood(svg, "Run");
    expect(n.neighbours.map((l) => l.id)).toEqual(["Idle", "Err"]);
    expect(n.neighbours.map((l) => l.says)).toEqual(["Reposo", "Fallo"]);
  });

  it("says nothing extra about a node nothing reaches", async () => {
    const svg = parse(await renderSvg(MACHINE));
    const n = neighbourhood(svg, "Err");
    expect(n.outgoing).toEqual([]);
    expect(n.incoming.map((l) => l.id)).toEqual(["Run"]);
  });
});

describe("lighting what is connected", () => {
  const over = async (id: string) => {
    const svg = parse(await renderSvg(MACHINE));
    const onFocus = vi.fn();
    const detach = attachFocus(svg, { onFocus });
    svg.fire("mousemove", svg.querySelectorAll(`[data-id="${id}"]`)[0]);
    return { svg, onFocus, detach };
  };

  it("lights the node, its neighbours and the relations between them", async () => {
    const { svg } = await over("Run");
    expect(svg.rootHas("pr-focusing")).toBe(true);
    expect(svg.lit("pr-focus").sort()).toEqual(
      ["Err", "Idle", "Idle->Run", "Run", "Run->Err", "Run->Idle"],
    );
    expect(svg.lit("pr-focus-root")).toEqual(["Run"]);
  });

  it("hands the host what it needs to say something about it", async () => {
    const { onFocus } = await over("Run");
    const focused = onFocus.mock.calls.at(-1)![0]!;
    expect(focused.node!.label).toBe("Running");
    expect(focused.node!.incoming.map((l: { says: string }) => l.says)).toEqual(["ev1 [g1]"]);
    expect(focused.relation).toBeUndefined();
  });

  it("on a relation, keeps the relation and its two ends", async () => {
    const svg = parse(await renderSvg(MACHINE));
    const onFocus = vi.fn();
    attachFocus(svg, { onFocus });
    svg.fire("mousemove", svg.querySelectorAll('[data-from="Run"][data-to="Err"]')[0]);
    const focused = onFocus.mock.calls.at(-1)![0]!;
    expect(focused.relation).toMatchObject({ says: "watchdog" });
    expect([focused.relation!.from.label, focused.relation!.to.label]).toEqual(["Running", "Fault"]);
    expect(svg.lit("pr-focus").sort()).toEqual(["Err", "Run", "Run->Err"]);
  });

  it("puts everything back when the pointer leaves, and when it is detached", async () => {
    const { svg, onFocus, detach } = await over("Run");
    svg.fire("mouseleave", null);
    expect(svg.rootHas("pr-focusing")).toBe(false);
    expect(svg.lit("pr-focus")).toEqual([]);
    expect(onFocus.mock.calls.at(-1)![0]).toBeNull();

    svg.fire("mousemove", svg.querySelectorAll('[data-id="Run"]')[0]);
    expect(svg.rootHas("pr-focusing")).toBe(true);
    detach();
    expect(svg.rootHas("pr-focusing")).toBe(false);
    svg.fire("mousemove", svg.querySelectorAll('[data-id="Run"]')[0]);
    expect(svg.rootHas("pr-focusing")).toBe(false);
  });
});
