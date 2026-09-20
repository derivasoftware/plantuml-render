# What plantuml-render draws

plantuml-render turns PlantUML text into deterministic SVG without Java. It
parses with the deriva tree-sitter grammar and draws a standard-driven subset;
whatever it does not model is kept as raw text and drawn as nothing, never as
an error.

## Class diagrams (the core)

- `class`, `abstract class`, `interface`, `enum`, plus `annotation`,
  `exception`, `struct`, `record`, `protocol`. Aliases (`class "X" as Y`).
- Members with visibility `+ - # ~`, `{static}` (underlined) and
  `{abstract}` (italic). Attributes `name : type`, methods
  `name(a: T, b: U) : R`. Types and parameters are syntax-coloured.
- Relations: `--|>` inheritance, `..|>` realization, `*--` composition,
  `o--` aggregation, `..>` dependency, `-->` association; labels after `:`;
  cardinalities in quotes are accepted.
- `namespace` and `package` blocks become containers; dotted names nest
  (`namespace a.b.c`).
- `note left|right|top|bottom of X : text` with `\n` line breaks.
- `class f <<function>>` marks a module-level function (badge `f`).
- `!include file` and `!includesub file!NAME` are expanded before parsing.

## Sequence diagrams

Participants of every kind (`actor` is drawn as a stick figure), `->` and
`-->` messages with labels, self messages, `alt/else`, `loop`, `opt`, `par`
frames with their condition, `== dividers ==`, `note over|left|right`.
Lanes are spaced by what crosses them, frames wrap only the participants
they involve, and rows grow to fit multi-line notes.

## Layout

Class diagrams are laid out by ELK's layered algorithm: bases above their
subtypes, containers laid out with their children, edges routed around the
boxes with their labels placed by the router, and the disconnected pieces
of a diagram packed into a grid. The output is deterministic: the same
source always produces the same SVG.

## Not drawn (kept lossless)

Activity, state, use case, component, deployment, mindmap, gantt and the
other non-UML kinds. The source is kept as it is and the SVG carries a
notice naming the kind instead of an empty frame; the command line repeats
the notice on stderr and still exits 0, so a batch keeps going. A class
diagram whose relations only reference undeclared entities gets the same
kind of notice. Render those kinds with `plantuml.jar`.

## Recommendations for readable output

- One diagram per file; aggregates through `!includesub` of leaf files.
- Declare relations. A box list without edges is a list, not a diagram.
- Keep member lines in the canonical plantuml-fmt style; that is what the
  syntax colouring understands.
