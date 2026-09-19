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
