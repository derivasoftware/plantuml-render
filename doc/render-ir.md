# render-IR — the drawing contract

`schema/render-ir.schema.json` (JSON Schema draft 2020-12) is the
family's second public API after the grammar's node vocabulary: an
**origin-neutral** description of what to draw, versioned under semver
and published to the generic registry on every release tag.

Two producers exist today — this package's PlantUML frontend
(text → CST → IR) and design-render (argos `DesignBase` → IR) — and one
consumer, the engine. Anything that emits valid IR renders identically.

## Shape

```jsonc
{
  "ir": 1,
  "nodes": [
    { "id": "argos.toolkit", "kind": "container", "label": "argos.toolkit" },
    { "id": "argos.toolkit.Cli", "kind": "box", "label": "Cli",
      "classifier": "class", "parent": "argos.toolkit",
      "sections": [["+ run(args: list[str]) : int"]] },
    { "id": "note-1", "kind": "note", "label": "hint" }
  ],
  "edges": [
    { "from": "argos.toolkit.Cli", "to": "argos.core.Engine",
      "kind": "dependency", "label": "uses" }
  ]
}
```

- **`id`s are stable, qualified names** — the load-bearing decision.
  They make SVG output diffable, let drag positions survive re-renders,
  and give containers/edges unambiguous anchors.
- `kind`: `box` (classifier with optional `sections` compartments),
  `container` (nests children via their `parent`), `note`. Boxes also
  carry optional `classifier` (free-form theming hook — the engine maps
  it to CSS classes, never colors), `stereotype` and `abstract`.
- Edge kinds (8): `inheritance`, `realization`, `composition`,
  `aggregation`, `dependency`, `association`, `attachment`, `message`.

### Sequence vocabulary (additive, still contract v1)

- `lifeline` nodes are participants (`classifier` keeps the PlantUML
  kind: participant, actor, database, …).
- `message` edges **require `order`** — the row they occupy, in source
  order; `dashed: true` marks responses (`-->`).
- `frame` nodes wrap a row range: `span: [first, last]`, with
  `dividers: [{at, label}]` for `else` sections.
- `divider` nodes (`== phase ==`) and anchored notes (`at` + `anchor`,
  position hint in `classifier`) each claim one row.

## Validation

The engine validates strictly on entry and rejects invalid IR outright
(`IrValidationError`). Validation runs through a **precompiled Ajv
standalone validator** generated at build time (`scripts/gen_schema.mjs`)
— no runtime `new Function`, so the browser bundle is CSP-safe
(`wasm-unsafe-eval` only, no `unsafe-eval`).

## Consuming the contract from another repo

Vendor the schema file at the release you pin, validate your emitted
documents against it in your own CI, and treat a pin bump as: replace
the vendored file, run your contract tests green. design-render
(`src/design_render/schema/`, `ContractViolation`) is the reference
implementation of this discipline.

## Versioning

Additive fields = minor; anything that changes the meaning or validity
of existing documents = major, with `ir` (the format tag) bumped only
on incompatible redesigns.
