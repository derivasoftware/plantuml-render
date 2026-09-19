---
type: spike
title: Embeddable, navigable, well-formed SVG from plantuml-render
date: 2026-09-19
task: PUML-40
follow_up: PUML-41 (epic), PUML-42..PUML-49, FOLIO-14, DDEV-578, DDEV-579
code_branch: spike/embeddable-navigable-svg (throwaway; deleted once this report lands)
---

# SPIKE — embeddable, navigable, well-formed SVG

## Question

Before writing any requirement: what does it take for the SVG that
plantuml-render emits to (Q1) live inline in an HTML page without side
effects, (Q2) be readable and good-looking, (Q3) be navigable — jump between
diagrams, hover for references, reach detail pages — and (Q4) be produced by
a standalone binary anyone can run? Anchors: SREQ-00003-1 (deterministic,
themable SVG) and SREQ-00007-1 (interactive read-only views); counterparts
outside the repo are design-render (model → IR) and folio (`bind` page).

## Method

- Corpus harness: 598 diagrams (the family's seven `design/` trees, the
  design plugin, argos, folio, iris, the portal examples) rendered in-process;
  size, aspect, timing, byte-determinism per diagram.
- Embedding harness: one HTML page with 270 SVGs inline measured in headless
  Chrome (`--dump-dom`): computed style of a control text outside the
  diagrams, root `color-scheme`, duplicate ids, content margins, effective
  font size when fitted to folio's 944 px column.
- Prototypes on the spike branch, each re-measured with the same harnesses:
  embedding profile, visual style, sequence polish, relation inference,
  wasm-based standalone CLI compiled with `bun build --compile`.
- An HTML test bench (`spike-bench/bench.mjs`: iris, the coffee corpus and an
  ad hoc library example covering every relation kind, a sequence, an HLD and
  an activity) and the same layer injected into folio's real iris report.
- BoK consulted: BOK-00050-1 (spike conventions), BOK-00017-1 (writing design
  diagrams), BOK-00049-1 (HLD conventions), BOK-00139-1 (function axis),
  BOK-00136-1, BOK-00195-2 (VS Code extension architecture), BOK-00005-1,
  BOK-00182-1 and BOK-00243-1 (precedent spikes); unrelated after reading:
  BOK-00239-1, BOK-00036-1.

## Findings

**Q1 — embedding (answer: yes, cheap).** Engine 0.6.6 leaks into the host:
the SVG's `text {}` and `:root { color-scheme }` rules apply to the whole
page (measured: a control text outside the diagrams inherits the diagram
ink; root `color-scheme` flips to `light dark`); 620 duplicate ids in 270
SVGs (markers ×270, namespace containers by name); margins 20 px top/left
vs 10 px bottom/right; fallbacks are light-only, so a dark host without
variables loses container labels and edges. Prototype (scoped selectors,
per-diagram id prefix with the logical id in `data-id`, symmetric margins,
light and dark tokens declared in the SVG, `max-width:100%;height:auto`):
leak none, duplicates 16 (two same-titled diagrams across repos), margins
10/10, dark host readable via `prefers-color-scheme` and `data-theme`.
Determinism and timing unchanged (598/598, ≤15 ms). Cost: one test of 44
(literal `url(#pr-tri)`); the interactive pages must key on `data-id`.

**Q2 — layout (answer: it is the remaining gap).** Each layer is one
unbounded row and only inheritance/realization place nodes: 43/448 argos
diagrams outside a 1:3..3:1 aspect; fitted to 944 px, 49/270 fall under 8 px
text (worst 1.2 px); widest 9346 px, tallest 18110 px. Edges are straight
centre-to-centre lines that cross other boxes; labels collide. A row-wrap
experiment (`PR_WRAP`) cuts the illegible ones to 23/595 but fixes neither
crossings nor the single column of sibling containers. Sequence layout uses
one pitch for all lanes (the coffee sequence is 1320 px wide vs 630 for the
jar), frames span every lane, rows are fixed height.

**Style (approved on the bench).** Rendering-only changes, IR contract
untouched: member lines tokenised into `tspan`s (name, params, types,
punctuation), visibility as coloured dots, `{static}` underlined and
`{abstract}` italic (UML), header band with classifier badge, folded notes
with `\n` honoured, edge-label halos, containers painted parent-first, edge
labels above leaves, actor glyph, frame tab with condition. Neutral
light/dark palette as CSS variables; the final tokens should come from
deriva/core/ui-kit.

**Q3 — navigation (answer: yes; the pieces exist).** Every entity already
carries a stable qualified id and every edge `data-from`/`data-to`. A 2 KB
framework-free script gives hover (entity + edges highlighted, a card) and
click (jump to the entity's own diagram). Injected into folio's real iris
report it works through folio's own hash router: `data-id` maps to folio's
anchors by folio's rule (`kind-` + non-alphanumerics dashed), the card is
filled from the class panel. What remains is to make links first-class:
`href`/`refs` in the IR, `<a href>` in the SVG, `--links` for producers
without a model, and design-render filling them from the GDD.

**Model finding.** 26/26 iris, 39/39 folio and 391/433 argos class diagrams
declare no relation at all: the CL_ writer emits members, never edges.
Inferring edges from member types (`PR_INFER`) yields 13 edges in CL_Iris.
The durable fix belongs to the design side (writer + drift), not the
renderer.

**Q4 — binary (answer: yes).** A CLI on web-tree-sitter with the grammar
wasm, the runtime wasm and the manual embedded, compiled with bun: 607/607
SVGs byte-identical to the native path; 38 ms per diagram, 0.84 s for all
607; cross-compiled from WSL to linux-x64 (83 MB), windows-x64 (90 MB, run
natively from `cmd.exe`, batch with `!includesub` identical to Linux) and
darwin-arm64 (65 MB). `--help` with examples; `docs <topic>` prints the
embedded manual. Public npm: `plantuml-render` and `plantuml-fmt` free,
`tree-sitter-plantuml` taken; distribution decided as GitHub releases, no npm.

**Side finding.** The lockfiles of plantuml-render and plantuml-vscode
declare the manifest pins but resolve to older commits (grammar 0.8.0,
render 0.6.3); `npm ci` obeys the resolved sha and the stable-set test reads
only package.json.

## Recommendations

1. Ship the embedding profile first; everything else builds on it.
2. Adopt the prototyped style; source the palette from ui-kit.
3. Replace the class layout with ELK (elkjs) — compound nodes, orthogonal
   routing, label placement, integer rounding for byte-determinism,
   `renderSvg` async. Sequence needs no engine: per-gap pitch, frames bound
   to the involved lanes, variable-height rows, activations.
4. Make the wasm grammar the only parser (npm and binary), build the three
   binaries in the tag job and attach them to the GitHub release; the
   stable set's install line becomes a download.
5. Links: optional `href`/`refs` in the IR, `<a href>` in nodes, `--links`
   and `--link-template`; promote `[[url]]` in the grammar; folio passes its
   anchor registry and hosts the navigation script; design-render fills
   references from the GDD.
6. Fix the lockfiles and make the stable-set test read the resolved sha.
7. Teach the CL_ writer to emit relations from code (bases, attribute
   types) and the drift checker to judge them.

## Follow-up REQs

Routed as tasks under the epic PUML-41; each mints its REQ/VER on start
(PROC-00014-2): PUML-42 embedding profile, PUML-43 visual style, PUML-44
sequence layout, PUML-45 class layout with ELK, PUML-46 wasm parser + CLI +
binaries, PUML-47 links in IR and CLI, PUML-48 grammar hyperlinks, PUML-49
lockfiles; FOLIO-14 navigable diagrams in `bind`; DDEV-578 writer emits
relations; DDEV-579 design-render fills `href`/`refs`.
