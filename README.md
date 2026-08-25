# plantuml-render

<!-- folio: colophon --project plantuml-render --junit test-results/junit.xml --coverage_ut test-results/coverage/cobertura-coverage.xml -->
![powered by: argos](https://img.shields.io/badge/powered%20by-argos-1f6feb) ![traced: 9%](https://img.shields.io/badge/traced-9%25-e05d44) ![verified: 100%](https://img.shields.io/badge/verified-100%25-2ea44f) ![tests: 100%](https://img.shields.io/badge/tests-100%25-2ea44f) ![UT: 58%](https://img.shields.io/badge/UT-58%25-e05d44) ![ST: n/a](https://img.shields.io/badge/ST-n%2Fa-lightgrey) ![diagnostics: 1](https://img.shields.io/badge/diagnostics-1-dfb317)

> **plantuml-render** is powered by **argos**. **folio** generates this documentation from the repository's model: 11 requirements · 11 verifications · 0 constraints. Quality: 9% traced to code · 100% verified · 100% tests passing · 58% UT coverage.
<!-- /folio -->

Deterministic SVG renderer for the
[deriva/plantuml](https://gitlab.semantiqa.dev/deriva/plantuml) family: a
**render-IR engine** plus a **PlantUML frontend** built on
[tree-sitter-plantuml](https://gitlab.semantiqa.dev/deriva/plantuml/tree-sitter-plantuml).

Three guarantees: **byte-deterministic** (same IR, byte-identical SVG, so
rendered design is diffable in merge requests), **themable, never themed**
(CSS custom properties on stable classes, neutral fallbacks only), and an
**honest frontier** (the class and sequence subsets are drawn; everything
else is simply not drawn). Validated over a 6 226-diagram wild corpus:
zero failures, all deterministic.

## Install

Generated from the manifest and the latest tag:

<!-- folio: install -->
```bash
git clone https://gitlab.semantiqa.dev/deriva/plantuml/plantuml-render
cd plantuml-render && npm install && npm install -g .
```
<!-- /folio -->

## Use cases

**Render a diagram to SVG**, includes expanded:

```bash
plantuml-render diagram.puml -o diagram.svg
```

**Interactive preview in the browser**: server-side parse, drag, filters
and live reload on save. `:PlantumlPreview` in Neovim opens this:

```bash
plantuml-render serve diagram.puml
```

**Render external render-IR**: any tool can emit the drawing contract
(`schema/render-ir.schema.json`) and get the same deterministic SVG:

```bash
plantuml-render --ir model.json -o out.svg
```

## Scope

The family covers a standard-driven subset of PlantUML, never the whole
language. Class diagrams: 125 of 149 standard constructs structural;
sequence: 70 of 111, with the lifecycle verbs (activate, ref, box,
delays) still raw; activity: actions and swimlanes structural, control
flow raw. Everything else (deployment, components, state, mindmaps,
gantt) parses lossless as raw lines, never an ERROR, but gets no
structure. The native engine draws the class and sequence
subsets; activity and the rest are not drawn.

## Documentation

- [render-IR](doc/render-ir.md): the drawing contract; shape, validation, versioning
- [Engine](doc/engine.md): layout and drawing internals
- [Interactive mode](doc/interactive.md): the serve-mode interaction shell
- [Architecture](doc/architecture.md): the model's diagrams, rendered by this same tool
- [Requirements & status](doc/requirements.md): what was asked and the traceability matrix
- [Repo quality](doc/quality.md): artefact inventory and health metrics

*Not affiliated with or endorsed by the PlantUML project.*
