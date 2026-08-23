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
- `flattenContainers` — remove containers, `parent` references and
  container-touching edges: a flat entity view.
- `hideNotes` — drop notes and their attachment edges.

Compose freely; order does not matter.

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
