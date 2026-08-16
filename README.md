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
  members, containers, six relation kinds, notes); everything else is
  simply not drawn.

## Usage

```bash
plantuml-render diagram.puml -o diagram.svg   # parse + render
plantuml-render --ir model.json -o out.svg    # render external render-IR
```

Validated over the 6&#8239;226-diagram wild corpus: zero failures, all
deterministic (`npm run eval -- <roots>`).

## Development

```bash
npm install && npm test
```

## Governance

An [argos](https://gitlab.semantiqa.dev/deriva/argos/argos) NA project —
see `CLAUDE.md`.
