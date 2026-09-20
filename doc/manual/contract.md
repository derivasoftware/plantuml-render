# The render-IR contract

`plantuml-render --ir model.json` draws a JSON document instead of PlantUML
text. The schema (`render-ir.schema.json`, semver) has nodes of kind
`box | container | note | lifeline | frame | divider` and edges of kind
`inheritance | realization | composition | aggregation | dependency |
association | attachment | message`. Any producer that emits it — the argos
design model through design-render, a script over your own data — gets the
same deterministic SVG as PlantUML text does.

Determinism is the contract: same input, byte-identical SVG, so rendered
diagrams can be committed and diffed.

`notice` (optional, at the root) is a producer's message drawn inside the
SVG in a muted, dashed box: below the content, or alone when there is
nothing else. The bundled frontend uses it for the diagram kinds it does
not draw. A document with no nodes and no notice is drawn as "Nothing to
draw." rather than as an empty frame.
