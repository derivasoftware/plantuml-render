# Spike PUML-53 — native activity diagrams

Question: can plantuml-render draw the new activity syntax natively, and how does it
look next to plantuml.jar? Sketched on the throwaway branch `spike/activity-diagrams`
(2026-09-20), shown to the Owner as a side-by-side page over four diagrams (the report
of GitHub issue #1, the family's ACT_CicloLimpieza, an order flow with two lanes, a
switch/case flow), and accepted as a first version. Consolidated by PUML-55 (grammar
0.11 repin, hyperlinks) and PUML-56 (this capability).

## Findings

- The grammar's main (0.11.0) parses the whole new activity control flow structurally
  (if/elseif/else, switch/case, while+break, repeat+backward, fork/join, split,
  partition, swimlane, arrows, terminals); the 0.9.7 wasm the renderer embedded only
  knew actions and swimlanes. Repinning was the enabler; the existing suite passes on
  the new wasm unchanged.
- A frontier of open flows folds the statement list into a flow graph in one pass:
  every new node receives the frontier's flows with their branch labels and becomes
  the frontier. Loops are back edges; forks and joins are bars; splits reuse the same
  frontier for every branch; `break`, `kill` and `detach` empty it.
- Without lanes, ELK layered (top-down, 36 px between layers) gives a readable
  flowchart at once. Lanes as ELK compound nodes are unreadable because the flow
  crosses lanes in both directions; ELK's interactive strategies do not keep the
  lanes separable either (measured on the order flow). Columns work: one ELK pass over
  the flow alone gives the layers and the in-lane order, every lane becomes a column
  with its bands of overlapping nodes packed and centred, and the flows are routed by
  hand through the gaps between layers, back edges through a channel on the right.
- plantuml.jar rejects ACT_CicloLimpieza ("swimlane must be defined at the start of
  the diagram"); the native renderer draws it.

## Accepted limits of the first version

- The hand router does not avoid nodes on long vertical drops and back edges share a
  channel; merge diamonds after if/else are not drawn (flows converge on the next
  node); branch labels sit on the flow near its source, not glued to the diamond.
- State diagrams stay out: the grammar keeps them as raw lines.
- The legacy activity syntax is not drawn; the SVG says so.
