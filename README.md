# plantuml-render

Deterministic SVG renderer for the
[deriva/plantuml](https://gitlab.semantiqa.dev/deriva/plantuml) family:
a **render-IR engine** plus a **PlantUML frontend** built on
[tree-sitter-plantuml](https://gitlab.semantiqa.dev/deriva/plantuml/tree-sitter-plantuml).

## Architecture

```
CST (grammar) ──► puml frontend ─┐
                                 ├─ render-IR ──► engine ──► SVG
external emitters (design-render)┘
```

The **render-IR** (`schema/render-ir.schema.json`) is the family's second
public API after the grammar's node vocabulary: an origin-neutral drawing
contract (boxes, compartments, containers, notes, typed edges) versioned
under semver. Emitters validate against it in their own CI; the engine
rejects invalid IR outright.

## Guarantees

- **Byte-deterministic**: same IR, byte-identical SVG — rendered design
  is diffable in merge requests. Stable element ids (qualified entity
  names).
- **Themable, never themed**: CSS custom properties on stable classes
  (`--pr-stroke`, `--pr-box-fill`, `pr-classifier-<c>`, `pr-edge-<kind>`);
  neutral fallbacks only.
- **Honest frontier**: the frontend draws the class subset (declarations,
  members, containers, six relation kinds, notes) and the sequence
  subset (participants, ordered messages, alt/else and loop frames,
  dividers, anchored notes — evidence-scoped from a real 84-diagram
  corpus); everything else is simply not drawn.

## Usage

```bash
plantuml-render diagram.puml -o diagram.svg   # parse + render
plantuml-render --ir model.json -o out.svg    # render external render-IR
```

Validated over the 6&#8239;226-diagram wild corpus: zero failures, all
deterministic (`npm run eval -- <roots>`).

## Documentation

- [`doc/render-ir.md`](doc/render-ir.md) — the drawing contract:
  shape, validation, versioning, how external emitters consume it.
- [`doc/engine.md`](doc/engine.md) — determinism, layout model,
  theming variables, include preprocessing, CLI.
- [`doc/interactive.md`](doc/interactive.md) — view filters and
  position overrides for interactive consumers.

## Interactive views

The engine ships the primitives interactive consumers (e.g. the
plantuml-vscode preview) build on — interaction state always lives in
the consumer, the output stays deterministic:

```ts
import { renderSvg, stripSections, flattenContainers, hideNotes } from "plantuml-render/browser";

let view = ir;
view = stripSections(view);      // hide members (pure IR → IR)
view = flattenContainers(view);  // hide namespaces
view = hideNotes(view);          // hide notes + attachments
const svg = renderSvg(view, {
  positions: { "argos.toolkit": { dx: 120, dy: -40 } }, // drag deltas by stable id
});
```

Position overrides cascade: a container's delta moves its whole
subtree, and containers re-fit around their children, so a dragged
node never escapes its frame. Namespace semantics follow PlantUML:
reopened namespaces merge, dotted names nest one container per
segment, entity ids stay qualified — which is what keeps drag deltas
stable across re-renders and `!includesub` aggregates.

## Development

```bash
npm install && npm test
```

## Governance

An [argos](https://gitlab.semantiqa.dev/deriva/argos/argos) NA project —
see `CLAUDE.md`.
