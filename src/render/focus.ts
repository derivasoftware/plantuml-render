/**
 * @file Pointing at a drawing: what touches what, and lighting it up.
 *
 * The SVG carries the graph — a stable id on every node, both ends on every
 * relation, an explanation on either — so a host does not have to reload the
 * model to answer "what does this touch". These two functions are that
 * answer, shared so every surface behaves the same: the preview, the editor
 * extension, a generated page.
 *
 * They live here and not inside the SVG on purpose. The SVG carries no
 * script: that is what makes it safe to paste into any page and to serve
 * under a strict policy. Behaviour belongs to whoever embeds it.
 */

/**
 * The slice of the DOM these functions touch, declared here rather than
 * pulled in: the package compiles without the DOM library on purpose, so
 * that engine code cannot reach for a document by accident. A real
 * `SVGElement` satisfies this.
 */
export interface DomElement {
  getAttribute(name: string): string | null;
  querySelector(selectors: string): DomElement | null;
  querySelectorAll(selectors: string): Iterable<DomElement>;
  closest(selectors: string): DomElement | null;
  readonly classList: { add(...tokens: string[]): void; remove(...tokens: string[]): void };
  readonly textContent: string | null;
}

/** The root the host hands over, which also listens for the pointer. */
export interface DomRoot extends DomElement {
  addEventListener(type: "mousemove" | "mouseleave", listener: (event: { target: unknown }) => void): void;
  removeEventListener(type: "mousemove" | "mouseleave", listener: (event: { target: unknown }) => void): void;
}

/** `[data-id="…"]`, with the two characters that could end the string early. */
const attr = (name: string, value: string) => `[${name}="${value.replace(/[\\"]/g, "\\$&")}"]`;

/** One end of what a node touches. */
export interface Link {
  /** The node at the other end. */
  id: string;
  /** Its name as drawn, which is what a reader recognises. */
  label: string;
  /** What the relation explains about itself, if anything. */
  says: string;
}

/** What a node touches, as the drawing knows it. */
export interface Neighbourhood {
  id: string;
  label: string;
  says: string;
  incoming: Link[];
  outgoing: Link[];
  /** Every node at the other end of something, each once. */
  neighbours: Link[];
}

const titleOf = (el: DomElement | null): string => {
  const title = el?.querySelector(":scope > title");
  return title?.textContent ?? "";
};

const nodeOf = (svg: DomElement, id: string): DomElement | null => svg.querySelector(attr("data-id", id));

/** The name a reader sees on a node; its id when it carries no text. */
const labelOf = (svg: DomElement, id: string): string => {
  const node = nodeOf(svg, id);
  const text = node?.querySelector("text:not(.pr-port-label)");
  return text?.textContent?.trim() || id;
};

const relations = (svg: DomElement): DomElement[] => [...svg.querySelectorAll("[data-from]")];

/**
 * What the node `id` touches: what reaches it, what leaves it, and who is at
 * the other end — each with the words the drawing carries for it.
 */
export function neighbourhood(svg: DomElement, id: string): Neighbourhood {
  const link = (other: string, edge: DomElement): Link => ({
    id: other,
    label: labelOf(svg, other),
    says: titleOf(edge),
  });
  const incoming: Link[] = [];
  const outgoing: Link[] = [];
  for (const edge of relations(svg)) {
    const from = edge.getAttribute("data-from") ?? "";
    const to = edge.getAttribute("data-to") ?? "";
    if (to === id) incoming.push(link(from, edge));
    if (from === id) outgoing.push(link(to, edge));
  }
  const seen = new Set<string>();
  const neighbours = [...incoming, ...outgoing].filter((l) => !seen.has(l.id) && seen.add(l.id));
  return {
    id,
    label: labelOf(svg, id),
    says: titleOf(nodeOf(svg, id)),
    incoming,
    outgoing,
    neighbours: neighbours.map((l) => ({ ...l, says: titleOf(nodeOf(svg, l.id)) })),
  };
}

/** What `attachFocus` reports when the pointer moves. */
export interface Focused {
  /** The element pointed at. */
  element: DomElement;
  /** The node, when a node was pointed at. */
  node?: Neighbourhood;
  /** The two ends, when a relation was pointed at. */
  relation?: { from: Link; to: Link; says: string };
}

export interface FocusOptions {
  /** Called when the pointer enters something, and with null when it leaves. */
  onFocus?: (focused: Focused | null) => void;
}

/**
 * Light up what the pointer is on, together with everything it touches, and
 * dim the rest. Returns the function that undoes it.
 *
 * The three classes are the engine's and already carry a default look:
 * `pr-focusing` on the root while something is focused, `pr-focus` on what
 * stays lit, `pr-focus-root` on the one being pointed at. A host that wants
 * another look redefines `--pr-focus` and `--pr-dimmed`, or the classes.
 */
export function attachFocus(svg: DomRoot, options: FocusOptions = {}): () => void {
  let lit: DomElement[] = [];

  const clear = () => {
    svg.classList.remove("pr-focusing");
    for (const el of lit) el.classList.remove("pr-focus", "pr-focus-root");
    lit = [];
    options.onFocus?.(null);
  };

  const move = (event: { target: unknown }) => {
    const target = event.target as DomElement | null;
    const el = target?.closest("[data-id], [data-from]");
    if (!el) {
      if (lit.length) clear();
      return;
    }
    if (lit[0] === el) return; // already on it; nothing moved
    for (const was of lit) was.classList.remove("pr-focus", "pr-focus-root");
    lit = [];

    const id = el.getAttribute("data-id");
    // One hop from what is pointed at, and one only. Growing the set while
    // walking the relations would carry it across the whole diagram: the
    // neighbour of a neighbour is not a neighbour.
    const origin = id
      ? [id]
      : [el.getAttribute("data-from") ?? "", el.getAttribute("data-to") ?? ""];
    const near = new Set(origin);
    const edgesLit = new Set<DomElement>();
    if (id) {
      for (const edge of relations(svg)) {
        const from = edge.getAttribute("data-from") ?? "";
        const to = edge.getAttribute("data-to") ?? "";
        if (from !== id && to !== id) continue;
        near.add(from === id ? to : from);
        edgesLit.add(edge);
      }
    } else {
      edgesLit.add(el);
    }
    // The pointed-at element first, so the next move can recognise it.
    lit.push(el);
    for (const candidate of svg.querySelectorAll("[data-id], [data-from]")) {
      if (candidate === el) continue;
      const own = candidate.getAttribute("data-id");
      const inside = own ? near.has(own) : edgesLit.has(candidate);
      if (inside) lit.push(candidate);
    }
    for (const el2 of lit) el2.classList.add("pr-focus");
    el.classList.add("pr-focus-root");
    svg.classList.add("pr-focusing");

    options.onFocus?.(
      id
        ? { element: el, node: neighbourhood(svg, id) }
        : {
            element: el,
            relation: {
              from: { id: el.getAttribute("data-from") ?? "", label: labelOf(svg, el.getAttribute("data-from") ?? ""), says: titleOf(nodeOf(svg, el.getAttribute("data-from") ?? "")) },
              to: { id: el.getAttribute("data-to") ?? "", label: labelOf(svg, el.getAttribute("data-to") ?? ""), says: titleOf(nodeOf(svg, el.getAttribute("data-to") ?? "")) },
              says: titleOf(el),
            },
          },
    );
  };

  svg.addEventListener("mousemove", move);
  svg.addEventListener("mouseleave", clear);
  return () => {
    svg.removeEventListener("mousemove", move);
    svg.removeEventListener("mouseleave", clear);
    clear();
  };
}
