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
- `sectionKinds` names what each `sections` compartment holds —
  `attributes` or `methods` — in the same order. The order alone cannot
  say it: a class with no attributes puts its methods first, so a
  consumer that folds or filters members reads this instead of counting
  positions. Absent when the compartments are not class members.
- `kind`: `box` (classifier with optional `sections` compartments),
  `container` (nests children via their `parent`), `note`. Boxes also
  carry optional `classifier` (free-form theming hook — the engine maps
  it to CSS classes, never colors), `stereotype` and `abstract`.
- Edge kinds (8): `inheritance`, `realization`, `composition`,
  `aggregation`, `dependency`, `association`, `attachment`, `message`.
- A `label` may carry several lines, separated by `\n`: they are drawn
  stacked and the layout reserves the room. Edges that are
  indistinguishable apart from their `label` and `title` are drawn as one,
  with both texts joined line by line — so a document of twenty parallel
  relations is one line on the drawing and twenty in its text.
- **An edge's `from` and `to` name nodes of the same document.** The
  engine draws an edge only when both ends were placed; an end that
  names nothing is reported in the rendered notice, with the names it
  could not find, rather than dropped in silence. A producer that emits
  a partial model gets a drawing that says what is missing from it.

### Sequence vocabulary (additive, still contract v1)

- `lifeline` nodes are participants (`classifier` keeps the PlantUML
  kind: participant, actor, database, …).
- `message` edges **require `order`** — the row they occupy, in source
  order; `dashed: true` marks responses (`-->`).
- `frame` nodes wrap a row range: `span: [first, last]`, with
  `dividers: [{at, label}]` for `else` sections.
- `divider` nodes (`== phase ==`) and anchored notes (`at` + `anchor`,
  position hint in `classifier`) each claim one row.

### Boundary ports (additive, still contract v1)

A `port` node is a named signal on another node's border, not a box in
the flow: block diagrams (Simulink, SysML) address the inputs and outputs
of a part rather than the part itself.

```jsonc
{ "id": "Controller.ref", "kind": "port", "label": "ref",
  "parent": "Controller", "direction": "in", "title": "ref : double" }
```

- `parent` is the node the port sits on, and is **required** — a port
  with no owner is dropped, since there is no border to sit on. A `box`
  and a `container` can both own ports; on a container the ports are the
  subsystem's boundary and may be wired to its children.
- `direction` (`in` | `out`) is what the signal does, and picks the
  default side: `in` west, `out` east.
- `side` (`west` | `east` | `north` | `south`) overrides that placement
  when the drawing reads better another way. Direction stays the
  meaning; side is only where it is drawn.
- Edges reference a port by its `id`, exactly like any other node, and
  the engine routes them to the square on the border instead of to the
  owner's centre.
- `label` is the name drawn above the square; `title` carries the
  signal type, which is too long for a border marker.

The owner grows to fit its ports and its layout constrains them to their
declared side, so a block with ports is still laid out by the same pass
as everything else.

### Links (additive, still contract v1)

Nodes and edges may carry `href` (a URL or a fragment such as
`#cls-ns-Order`), `title` (a tooltip) and `refs` (an object of named
references — `reqs`, `code`, `tests`, `diagrams` … — each a string or a
list). The engine wraps a linked element in `<a href>`, emits the tooltip
as `<title>` and every reference as `data-ref-<key>` (lists join with
spaces). `applyLinks` decorates a document from a map or a template; the
CLI exposes it as `--links` and `--link-template`.

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
