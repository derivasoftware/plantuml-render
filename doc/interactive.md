# Interactive views — the primitives

The engine stays deterministic and stateless; interactivity is built
from two pure primitives that consumers (e.g. the plantuml-vscode
preview) drive. Interaction state lives entirely in the consumer.

## IR view filters

```ts
import { stripSections, flattenContainers, hideNotes } from "plantuml-render/browser";
```

Each is a pure IR → IR projection (input never mutated, output still
contract-valid):

- `stripSections` — drop member compartments (headers only).
- `filterMembers` — keep the members a predicate accepts; the granular
  half of `stripSections`.
- `flattenContainers` — remove containers, `parent` references and
  container-touching edges: a flat entity view.
- `hideNotes` — drop notes and their attachment edges.

Compose freely; order does not matter.

### Folding members

A box generated from an external model often carries many low-value
members beside the few that matter. Hiding them after the fact does not
work — the layout places everything absolutely, so a hidden member
leaves a hole and the box keeps its size. Folding belongs before layout:

```ts
filterMembers(ir, (m) => m.startsWith("+"));            // public only
filterMembers(ir, (_m, c) => c.kind !== "methods");     // attributes only
filterMembers(ir, (m, c) => c.kind === "methods" || !m.includes("cfg"));
```

The predicate receives the member verbatim — the visibility marker is its
first character — plus the compartment's `kind` and index and the node it
belongs to. A compartment that empties is dropped, its `sectionKinds`
entry with it, and the engine lays the smaller box out as it would any
other: the box shrinks, with no gap.

Select by `kind` rather than by index. Position lies: a class with no
attributes puts its methods in compartment zero.

The producer keeps every member; only the view folds. That is the whole
reason this is a filter and not a flag in the IR — what is secondary
depends on who is looking.

## Position overrides

```ts
renderSvg(ir, { positions: { "argos.toolkit": { dx: 120, dy: -40 } } });
```

`positions` maps **stable ids** to pixel deltas relative to the
computed layout:

- **Cascade**: a container's delta moves its entire subtree — dragging
  a namespace moves everything in it.
- **Adaptive containers**: after deltas apply, every container re-fits
  to the union of its children plus padding — a dragged child can
  never escape its frame; the frame follows.
- **Covering viewBox**: negative coordinates stay visible.

Because ids are qualified names, a `positions` map outlives re-renders
of edited source: unchanged entities keep their overrides. That — plus
PlantUML namespace semantics in the frontend (reopened namespaces
merge into one container; dotted names nest one container per segment;
first declaration wins for duplicate entity ids) — is what makes drag
stable across aggregate files composed from many `!includesub`
fragments.

## Highlighting what is connected

The SVG carries the graph: every box has its `data-id`, every relation is a
`g.pr-edge-group` with `data-from` and `data-to`. A host does not have to reload
the model to know what touches what — it walks those attributes and switches
three classes the engine already styles:

| Class | Where | Default |
|---|---|---|
| `pr-focusing` | on the root `svg` | dims everything to `--pr-dimmed` |
| `pr-focus` | on what stays lit | full opacity |
| `pr-focus-root` | on the one pointed at | outlined in `--pr-focus` |

Both come with the package, so no surface writes them twice:

```ts
import { attachFocus, neighbourhood } from "plantuml-render/browser";

const release = attachFocus(svg, {
  onFocus: (focused) => {
    if (!focused) return hide();
    // a node: what reaches it, what leaves it, who is at the other end
    if (focused.node) show(focused.node);
    // a relation: what it says, and its two ends
    else show(focused.relation);
  },
});
// release() puts the drawing back and stops listening.
```

`neighbourhood(svg, id)` answers the same question without the pointer, for a
search box or a keyboard walk. Neither touches the model: both read the
drawing, which carries the graph and the words.

The panel itself is not in the package. What a host shows — a tooltip, a side
card, a status line — is its own decision; what is shared is the walk and the
classes. For a host that would rather write it by hand, that walk is this:

```js
svg.addEventListener("mouseover", (e) => {
  const el = e.target.closest("[data-id], [data-from]");
  if (!el) return;
  const id = el.dataset.id;
  const near = new Set(id ? [id] : [el.dataset.from, el.dataset.to]);
  for (const g of svg.querySelectorAll("[data-from]")) {
    const { from, to } = g.dataset;
    if (near.has(from)) near.add(to);
    if (near.has(to)) near.add(from);
  }
  svg.classList.add("pr-focusing");
  for (const n of svg.querySelectorAll("[data-id], [data-from]")) {
    const d = n.dataset;
    n.classList.toggle("pr-focus", near.has(d.id) || (near.has(d.from) && near.has(d.to)));
    n.classList.toggle("pr-focus-root", n === el);
  }
});
```

A relation is drawn a pixel wide and a pixel is a poor target, so each one
carries an invisible band along the same path — `path.pr-edge-hit`,
`--pr-edge-hit` wide, 12 by default — which takes the pointer. The drawn line
takes none. On a diagram of a thousand states this is the difference between a
wall and something that can be read: point at a state and keep its
neighbourhood.

## A minimal interactive consumer

```ts
let view = treeToIr(tree.rootNode);          // or any valid IR
if (!showMembers) view = stripSections(view);
container.innerHTML = renderSvg(view, { positions });
// drag: on pointermove over a [id] group, positions[id] = {dx, dy}; re-render.
// pan/zoom: CSS transform on the container — never touches the engine.
```

The vscode extension's `src/webview/preview.ts` is the full reference
implementation (drag with rAF batching, filters, pan/zoom, resets).
