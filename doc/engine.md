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

A block diagram's chain also wraps towards the declared aspect ratio
(`elk.layered.wrapping.strategy`): six chained subsystems go from 3080x116
(26:1) to 1040x446 (2.3:1), which is the difference between a drawing shown at
a quarter of its size and one shown whole. Outlines carry
`vector-effect: non-scaling-stroke` for the same reason — a stroke scaled down
with the drawing stops reading as a line.

The layout direction follows the ports: a document whose ports mostly sit on
the west and east borders is laid out left to right, because that is where its
signals enter and leave. Without that, every wire turns two corners to reach a
border the content does not run towards.

A container that carries ports is given a minimum size of what its own names
need — the widest name on each side, plus the padding. One with children is
sized from them and has room to spare, but a block whose parts live in another
file has no children at all, and the router would collapse it to nothing and
pile every name into the same few pixels.

A container's port names are laid out by the router, not placed afterwards:
each port carries its name as an ELK label with `elk.portLabels.placement:
INSIDE`, and the container's size constraints include `PORT_LABELS`, so the
room is reserved before the children are placed. A box takes neither — its
size comes from its own text, so the router has nothing to grow — and its
names are drawn outside and above the square, clear of both the wire and the
box's content.

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
| `--pr-stroke-width`, `--pr-container-stroke-width` | how hard those borders read |
| `--pr-edge-width` | how thick a relation's line is |
| `--pr-arrow-size` | arrowhead size, as a multiple of its natural size |
| `--pr-edge-hit` | how wide a relation's invisible pointer target is |
| `--pr-focus`, `--pr-dimmed` | the highlight colour, and how far the rest fades |
| `--pr-text` | all text |
| `--pr-box-fill`, `--pr-note-fill`, `--pr-container-fill` | fills |
| `--pr-font` | font family |
| `--pr-port-in`, `--pr-port-out` | boundary port squares, by direction |

A host page sets these from outside, which is the normal way to theme a
diagram. An SVG written to a file has no host, so its producer bakes them in
instead: `renderSvg(ir, { tokens })` emits one `.pr-diagram` rule after the
defaults, where a declaration wins by coming later. The CLI exposes it as
`--token <name=value>`, and `--outline bold` is the one combination with a
name — the darkest border at two pixels, which is what a large diagram shown
small needs. A token whose name is not a custom property is dropped, and a
value cannot close the rule it sits in.

`--pr-arrow-size` is the one token the renderer reads itself rather than
leaving to the browser: an arrowhead's size lives in marker attributes that CSS
cannot reach. It scales all five markers, ignores anything that is not a
positive number, and is capped at four. A diagram of many short wires reads as
mostly arrowhead at the natural size; `0.6` gives it back its lines.

Per-classifier (`pr-classifier-class`, `-interface`, `-enum`, …) and
per-edge-kind (`pr-edge-inheritance`, …) classes allow finer theming.
The vscode extension's editor-theme mapping (its `client/preview.ts`)
is the reference consumer.

An edge is emitted as one `g.pr-edge-group` carrying the identity, the tooltip
and the references, around two paths with the same geometry: `pr-edge-hit`,
invisible and wide, which takes the pointer, and `pr-edge`, which takes the ink
and takes no events. One element per relation, so a host that collects
`[data-from]` gets each one once. See `plantuml-render docs navigation` for the
highlight classes the group enables.

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
