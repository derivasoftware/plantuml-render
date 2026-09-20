# plantuml-render

<!-- folio: colophon --project plantuml-render --junit test-results/junit.xml --coverage_ut test-results/coverage/cobertura-coverage.xml -->
![powered by: argos](https://img.shields.io/badge/powered%20by-argos-1f6feb) ![traced: 100%](https://img.shields.io/badge/traced-100%25-2ea44f) ![verified: 100%](https://img.shields.io/badge/verified-100%25-2ea44f) ![tests: 100%](https://img.shields.io/badge/tests-100%25-2ea44f) ![UT: 93%](https://img.shields.io/badge/UT-93%25-2ea44f) ![ST: n/a](https://img.shields.io/badge/ST-n%2Fa-lightgrey) ![diagnostics: 0](https://img.shields.io/badge/diagnostics-0-2ea44f)

> **plantuml-render** is powered by **argos**. **folio** generates this documentation from the repository's model: 11 requirements · 11 verifications · 0 constraints. Quality: 100% traced to code · 100% verified · 100% tests passing · 93% UT coverage.
<!-- /folio -->

Deterministic SVG renderer for the
[deriva/plantuml](https://github.com/derivasoftware) family: a
**render-IR engine** plus a **PlantUML frontend** built on
[tree-sitter-plantuml](https://github.com/derivasoftware/tree-sitter-plantuml).

Three guarantees: **byte-deterministic** (same IR, byte-identical SVG, so
rendered design is diffable in merge requests), **themable, never themed**
(CSS custom properties on stable classes, neutral fallbacks only), and an
**honest frontier** (the class, sequence and activity subsets are drawn;
everything else says so in the SVG instead of drawing). Validated over a 6 226-diagram wild corpus:
zero failures, all deterministic.

## Install

**Standalone executable (recommended).** One file per platform, nothing
else to install — no Node, no Java, no compiler. Download it from the
[GitHub release](https://github.com/derivasoftware/plantuml-render/releases),
put it on your `PATH` as `plantuml-render`, and:

```bash
plantuml-render --help                 # usage and examples
plantuml-render docs                   # the manual: diagrams, embedding, navigation, style, contract
plantuml-render design/CL_Order.puml -o CL_Order.svg
plantuml-render render design/ -o site/svg/
```

Binaries: `linux-x64`, `linux-arm64`, `windows-x64`, `darwin-arm64`,
`darwin-x64`. They embed the grammar (wasm), the parser runtime and the
manual, so `plantuml-render docs` always describes the version you run.

Every release also carries `SHA256SUMS`, covering every executable, so a
script that downloads the binary can verify it before running it:

```bash
sha256sum -c SHA256SUMS --ignore-missing     # shasum -a 256 -c on macOS
```

**npm package (for JavaScript consumers).** The release also carries the
package tarball; it needs Node ≥ 18 and no native toolchain, since the
frontend parses through the wasm grammar in every host:

```bash
npm install -g <plantuml-render-x.y.z.tgz from the release>
```

As a library, `import { renderSvg, pumlToIr } from "plantuml-render"` on
node and `plantuml-render/browser` in a web page.

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

## Embedding

The SVG is written to live inline in any HTML page. Every style rule is
scoped under `.pr-diagram`, so nothing leaks into the host; ids are prefixed
per diagram (a hash of the title) so many diagrams share one document, with
the logical entity id in `data-id` and edges carrying `data-from` and
`data-to`; the root keeps its natural `width`/`height` plus
`max-width:100%;height:auto`, so small diagrams stay small and large ones
shrink to their container. Light and dark palettes travel inside the SVG:
the diagram follows `prefers-color-scheme` and a host can force one with
`data-theme="dark"` or `data-theme="light"` on the root element. Override
any token from the host, e.g. `.pr-diagram { --pr-text: #222 }`.

Members follow UML notation with syntax colouring: visibility as a
coloured dot, `{static}` underlined, `{abstract}` italic, types and
parameters in their own colours; boxes carry a header band and a
classifier badge. See `plantuml-render docs style` for the token list.

Entities can carry links: `href`, `title` and `refs` in the render-IR,
or `--links map.json` and `--link-template` on the command line; the SVG
then navigates by itself, and a host page can build hover cards on the
`data-id` and `data-ref-*` attributes. See `plantuml-render docs navigation`.

Class diagrams are laid out by ELK's layered algorithm (bases above
subtypes, orthogonal edges routed around the boxes, disconnected pieces
packed into a grid); `renderSvg` is asynchronous for that reason. Activity
diagrams (new syntax) are drawn as flowcharts with the same algorithm, and
swimlanes become columns.

## Scope

The family covers a standard-driven subset of PlantUML, never the whole
language. Class diagrams: 125 of 149 standard constructs structural;
sequence: 70 of 111, with the lifecycle verbs (activate, ref, box,
delays) still raw; activity (new syntax): actions, swimlanes and the
control flow structural, the legacy syntax raw. Everything else
(deployment, components, state, mindmaps, gantt) parses lossless as raw
lines, never an ERROR, but gets no structure. The native engine draws the
class, sequence and activity subsets; the rest is not drawn and the SVG
says so.

## Documentation

- [render-IR](doc/render-ir.md): the drawing contract; shape, validation, versioning
- [Engine](doc/engine.md): layout and drawing internals
- [Interactive mode](doc/interactive.md): the serve-mode interaction shell
- [Architecture](doc/architecture.md): the model's diagrams, rendered by this same tool
- [Requirements & status](doc/requirements.md): what was asked and the traceability matrix
- [Repo quality](doc/quality.md): artefact inventory and health metrics

*Not affiliated with or endorsed by the PlantUML project.*
