# The engine — deterministic SVG

## Guarantees

- **Byte-deterministic**: same IR (and same `RenderOptions`) → byte
  identical SVG. Rendered design diffs cleanly in merge requests.
- **Integer geometry, fixed metrics**: `CHAR_W=8`, `LINE_H=18`,
  `PAD=10`, `CONTAINER_PAD=18`, `CONTAINER_LABEL_H=22`, `GAP_X=48`,
  `GAP_Y=64`. No font measurement, no platform variance.
- **Stable element ids**: every node's SVG group carries the IR id;
  edge paths carry `data-from`/`data-to`. Consumers can address the
  output (drag, highlight, test).

## Layout model

Containers form frames (children before parents in placement order, so
container bounds resolve in one forward pass). Within a frame, nodes
order into layers by **longest inheritance path** — base classes above
derived — then flow left-to-right with `GAP_X`/`GAP_Y`. The viewBox
covers the placed extent, including negative coordinates introduced by
position overrides.

The layout direction follows the ports: a document whose ports mostly sit on
the west and east borders is laid out left to right, because that is where its
signals enter and leave. Without that, every wire turns two corners to reach a
border the content does not run towards.

A `port` node leaves the node graph: it becomes an ELK port on its owner,
which switches that owner to `FIXED_SIDE` constraints so a signal stays on
the border it was declared for. Only owners that declared ports are
constrained, so every other box keeps the free placement it had. The owner's
minimum height grows to the span its busiest side needs, and the viewBox
accounts for the names, which are drawn outside the border and above the
square: beside it is where the wire arrives, over it is the block's own
content, and the corner between the two is free. Edges that end at a port are
routed to the square: ELK reports their geometry relative to the lowest common
ancestor of the two ends, and a port counts as inside its owner, so the engine
resolves a port to its owner before deciding which frame the path belongs to.

A notice sits under the drawing: the producer's own (`notice` on the document),
and the engine's own line for the relations it could not draw, which names up
to four endpoints that match no node and counts the rest. A document that drew
nothing at all is left to its producer, which has already said why.

## Theming — themable, never themed

The SVG hard-codes **no colors**: everything styles through CSS custom
properties on stable classes, with neutral fallbacks.

| Variable | Styles |
|---|---|
| `--pr-stroke` | box and note borders, separators |
| `--pr-container-stroke` | container borders |
| `--pr-text` | all text |
| `--pr-box-fill`, `--pr-note-fill`, `--pr-container-fill` | fills |
| `--pr-font` | font family |
| `--pr-port-in`, `--pr-port-out` | boundary port squares, by direction |

Per-classifier (`pr-classifier-class`, `-interface`, `-enum`, …) and
per-edge-kind (`pr-edge-inheritance`, …) classes allow finer theming.
The vscode extension's editor-theme mapping (its `client/preview.ts`)
is the reference consumer.

## Sequence layout

A `lifeline` node switches the document to the time-axis layout (same
determinism and theming contract; position overrides don't apply —
rows *are* the layout): head boxes on a fixed pitch derived from head
and message-label widths, dashed lifelines, one row per `order`.
Messages draw with open-arrow markers and `data-from`/`data-to`/
`data-order`; responses get `pr-msg-dashed`; self-messages loop
(`pr-msg-self`). Frames wrap their `span` with an 8px inset per
nesting level and dashed `else` dividers; `==` bands span the lanes;
anchored notes sit beside their lifeline. Heads are `pr-box`, so box
theming (and the vscode editor mapping) applies unchanged.

## Include preprocessing

Aggregate files built from `!include` / `!includesub file!NAME` expand
**before** parsing via `expandIncludes(source, base, loader)` — the
`IncludeLoader` (`read`/`resolve`/`dirname`) is injected, so the node
CLI wires `fs` and the vscode host wires `workspace.fs`; the browser
bundle itself never touches files. Cycles are cut by a seen-set;
unresolvable targets keep their directive line verbatim (it lands on
the grammar's raw frontier and draws nothing), matching the argos
reader's lenient posture.

## CLI

```bash
plantuml-render diagram.puml -o diagram.svg   # text → CST → IR → SVG
plantuml-render --ir model.json -o out.svg    # external IR → SVG
```

`npm run eval -- <roots>` renders every `.puml` under the roots twice
and asserts success + determinism — the wild-corpus gate.
