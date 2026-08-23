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

## Theming — themable, never themed

The SVG hard-codes **no colors**: everything styles through CSS custom
properties on stable classes, with neutral fallbacks.

| Variable | Styles |
|---|---|
| `--pr-stroke` | box/container/note borders, edge lines |
| `--pr-text` | all text |
| `--pr-box-fill`, `--pr-note-fill`, `--pr-container-fill` | fills |
| `--pr-font` | font family |

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
