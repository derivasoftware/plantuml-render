# Spike PUML-74 — state diagrams

Question: can the family draw state diagrams natively, and how far should a first
version reach? Measured on 2026-10-07 against plantuml-render 0.20.0 and
tree-sitter-plantuml 0.13.1. The throwaway corpus lives on the grammar's
`spike/state-diagrams` at `5c8d8dc`; the drawing prototype was built by hand as
render-IR and is reproduced in Method below.

## Method

Two halves, measured separately, because the gap could be in either.

The grammar half: one file with every construct the chapter of
`plantuml.com/state-diagram` documents — 45 statement lines — parsed with the
current grammar, and every line attributed to the statement-level node that covers
it. Same instrument as the class-diagram conformance suite: a construct is
structural (a dedicated node), raw (lossless pass-through) or ERROR, and the
frontier policy says ERROR is never acceptable.

The drawing half: a state machine written by hand as render-IR using only the node
kinds that exist today — `start` for the initial state, `end` for the final one,
`action` for a state, `container` for a composite, `flow` edges with labels for
transitions — and rendered with the engine unchanged.

## Findings

- **The drawing is already there.** The hand-built IR renders without a single
  engine change: rounded states, a filled dot for the initial state, a bullseye for
  the final one, a composite drawn as a container with its own initial state inside,
  and labelled transitions routed orthogonally. The vocabulary the activity work
  added covers a state machine as it stands. The first version needs no new node
  kind, no new layout, no new theming.
- **The gap is the grammar, and it is large.** Of the 45 lines, 28 are raw: `state X`,
  `state "long" as X`, every stereotyped pseudostate, the composite block `state X {
  … }`, every transition written inside one, and the `--` that separates regions. The
  composite does not open a block, so its body is a flat run of raw lines and the
  nesting is simply not in the tree.
- **Four lines are ERROR, which the frontier policy does not allow**: `Running -->
  [*]`, `Hot --> [*]`, `Composite --> [H]`, `Composite --> [H*]` — a transition
  *towards* a terminal or history pseudostate. The same bracket on the left
  (`[*] --> Idle`) parses, because the scanner walks a leading qualifier bracket.
  This is a defect today, independent of ever drawing a state diagram.
- **Thirteen lines are structural by coincidence**, carrying class-diagram meanings:
  a transition is a `relation`, `Long1 : a description` is a `colon_member`, the
  notes are `note_statement`, `hide empty description` and `scale` are display
  directives. Useful — the transition is genuinely the same shape — but a frontend
  cannot tell a state transition from an association without the diagram's kind.
- **The renderer already decides the kind correctly**: a state diagram is detected
  and refused with a notice naming it. The detection is there; only the branch that
  would build the IR is missing.

## Recommendations

A first cut, in this order:

1. **Fix the ERROR first, on its own.** A transition to `[*]` or `[H]` should parse
   like any other relation, whatever is drawn later. It is a frontier-policy defect
   in a released grammar and does not need the rest of this.
2. **Grammar: the state block and the state declaration.** `state X { … }` as a
   container like `package_block`, plus `state X`, `state "long" as X`,
   `state X <<stereotype>>` and `state X : description`. That is what turns the
   chapter from 28 raw lines into a tree, and it is the bulk of the work.
3. **Renderer: a state frontend.** Walk the state tree into the IR vocabulary above.
   Each state is an `action`, `[*]` becomes a `start` at the top of its level and an
   `end` where a transition arrives at it, a composite is a `container`, and a
   transition is a `flow` edge whose label is the trigger, guard and action verbatim.
4. **Leave out of the first cut, and say so in the SVG**: concurrent regions (`--`),
   history (`[H]`, `[H*]`), the pseudostate stereotypes drawn as their own shapes
   (fork and join bars, choice diamond, entry and exit points), and arrow direction
   hints. Each is a shape or a layout rule rather than a parse, so they can land one
   at a time afterwards.

The split follows the activity precedent: the grammar milestone enables the
renderer milestone, and the renderer's first version accepts named limits rather
than waiting for the whole chapter.

## Follow-up

- Grammar: the `X --> [*]` ERROR, as a defect against the frontier policy.
- Grammar: state declarations and the composite block, with the chapter corpus from
  `5c8d8dc` promoted to `examples/standard/` once it parses without ERROR.
- Renderer: the state frontend, repin, and the notice narrowed to what is still not
  drawn.
