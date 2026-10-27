# Architecture

The pipeline is CST → puml frontend → render-IR → engine → SVG, with the
render-IR as the public seam external emitters target. The figures below are
the repository's actual design, rendered by plantuml-render itself.

<!-- folio: design --assets assets -->
### System view

#### HLD_PlantumlRender

_hld · `design/hld/HLD_PlantumlRender.puml`_

- traces to: `SREQ-00001-1`

![HLD_PlantumlRender](assets/HLD_PlantumlRender.svg)

### Module overview

#### CL_ActivityDiagrams

_cl · `design/lld/render/CL_ActivityDiagrams.puml`_

- traces to: `REQ-00025-1`
- verified by: `tests/integration/activity.test.ts` (1)

![CL_ActivityDiagrams](assets/CL_ActivityDiagrams.svg)

#### CL_CliModule

_cl · `design/lld/render/CL_CliModule.puml`_

- traces to: `REQ-00004-1` `REQ-00014-1`
- implemented in: `src/render/cli.ts`
- verified by: `tests/integration/cli.test.ts` (10) · `tests/integration/manual.test.ts` (6)

![CL_CliModule](assets/CL_CliModule.svg)

#### CL_NotDrawnNotice

_cl · `design/lld/render/CL_NotDrawnNotice.puml`_

- traces to: `REQ-00021-1`
- verified by: `tests/integration/cli.test.ts` (4) · `tests/integration/engine.test.ts` (10) · `tests/integration/frontend.test.ts` (5)

![CL_NotDrawnNotice](assets/CL_NotDrawnNotice.svg)

#### CL_Render

_cl · `design/lld/render/CL_Render.puml`_

- traces to: `REQ-00001-1` `REQ-00002-1` `REQ-00003-1` `REQ-00004-1` `REQ-00005-1` `REQ-00006-1` `REQ-00007-1` `REQ-00008-1` `REQ-00009-1` `REQ-00010-1` `REQ-00011-1` `REQ-00017-1` `REQ-00018-1` `REQ-00030-1` `REQ-00031-1` `REQ-00032-1` `REQ-00033-1`
- implemented in: `src/render/activity.ts` · `src/render/cli.ts` · `src/render/engine.ts` · `src/render/filters.ts` · `src/render/focus.ts` · `src/render/frontend.ts` · `src/render/ir.ts` · `src/render/links.ts` · `src/render/preprocess.ts` · `src/render/sequence.ts` · `src/render/serve.ts` · `src/render/shared.ts` · `src/render/state.ts`
- verified by: `tests/integration/bundle.test.ts` (5) · `tests/integration/cli.test.ts` (10) · `tests/integration/engine.test.ts` (4) · `tests/integration/filters.test.ts` (9) · `tests/integration/focus.test.ts` (7) · `tests/integration/frontend.test.ts` (9) · `tests/integration/interactive.test.ts` (9) · `tests/integration/ir.test.ts` (4) · `tests/integration/links.test.ts` (5) · `tests/integration/ports.test.ts` (36) · `tests/integration/sequence.test.ts` (8) · `tests/integration/serve.test.ts` (6) · `tests/integration/state.test.ts` (10)

![CL_Render](assets/CL_Render.svg)

### Class detail

<details>
<summary><code>CL_IrModule</code> · traces to <code>REQ-00001-1</code> <code>REQ-00017-1</code> <code>REQ-00008-1</code></summary>
<ul>
<li>source: <code>design/lld/render/CL_IrModule.puml</code></li>
<li>implemented in: <code>src/render/ir.ts</code></li>
<li>verified by: <code>tests/integration/ir.test.ts</code> (4), <code>tests/integration/links.test.ts</code> (4), <code>tests/integration/sequence.test.ts</code> (2)</li>
</ul>
<p><img alt="CL_IrModule" src="assets/CL_IrModule.svg"></p>
</details>

<details>
<summary><code>CL_IrValidationError</code> · traces to <code>REQ-00001-1</code></summary>
<ul>
<li>source: <code>design/lld/render/CL_IrValidationError.puml</code></li>
<li>implemented in: <code>src/render/ir.ts</code></li>
<li>verified by: <code>tests/integration/ir.test.ts</code> (4)</li>
</ul>
<p><img alt="CL_IrValidationError" src="assets/CL_IrValidationError.svg"></p>
</details>

<details>
<summary><code>CL_EngineModule</code> · traces to <code>REQ-00002-1</code> <code>REQ-00006-1</code> <code>REQ-00020-1</code> <code>REQ-00030-1</code> <code>REQ-00033-1</code> <code>REQ-00016-1</code></summary>
<ul>
<li>source: <code>design/lld/render/CL_EngineModule.puml</code></li>
<li>implemented in: <code>src/render/engine.ts</code></li>
<li>verified by: <code>tests/integration/bundle.test.ts</code> (6), <code>tests/integration/cli.test.ts</code> (5), <code>tests/integration/embed.test.ts</code> (6), <code>tests/integration/engine.test.ts</code> (5), <code>tests/integration/interactive.test.ts</code> (4), <code>tests/integration/layout.test.ts</code> (6), <code>tests/integration/ports.test.ts</code> (36), <code>tests/integration/style.test.ts</code> (6)</li>
</ul>
<p><img alt="CL_EngineModule" src="assets/CL_EngineModule.svg"></p>
</details>

<details>
<summary><code>CL_SharedModule</code> · traces to <code>REQ-00002-1</code> <code>REQ-00012-1</code> <code>REQ-00015-1</code> <code>REQ-00017-1</code></summary>
<ul>
<li>source: <code>design/lld/render/CL_SharedModule.puml</code></li>
<li>implemented in: <code>src/render/shared.ts</code></li>
<li>verified by: <code>tests/integration/embed.test.ts</code> (6), <code>tests/integration/engine.test.ts</code> (4), <code>tests/integration/links.test.ts</code> (4), <code>tests/integration/style.test.ts</code> (6)</li>
</ul>
<p><img alt="CL_SharedModule" src="assets/CL_SharedModule.svg"></p>
</details>

<details>
<summary><code>CL_SequenceModule</code> · traces to <code>REQ-00009-1</code> <code>REQ-00019-1</code> <code>REQ-00026-1</code> <code>REQ-00027-1</code></summary>
<ul>
<li>source: <code>design/lld/render/CL_SequenceModule.puml</code></li>
<li>implemented in: <code>src/render/sequence.ts</code></li>
<li>verified by: <code>tests/integration/sequence-layout.test.ts</code> (9), <code>tests/integration/sequence.test.ts</code> (3), <code>tests/integration/style.test.ts</code> (6)</li>
</ul>
<p><img alt="CL_SequenceModule" src="assets/CL_SequenceModule.svg"></p>
</details>

<details>
<summary><code>CL_FiltersModule</code> · traces to <code>REQ-00005-1</code></summary>
<ul>
<li>source: <code>design/lld/render/CL_FiltersModule.puml</code></li>
<li>implemented in: <code>src/render/filters.ts</code></li>
<li>verified by: <code>tests/integration/filters.test.ts</code> (9)</li>
</ul>
<p><img alt="CL_FiltersModule" src="assets/CL_FiltersModule.svg"></p>
</details>

<details>
<summary><code>CL_LinksModule</code> · traces to <code>REQ-00018-1</code></summary>
<ul>
<li>source: <code>design/lld/render/CL_LinksModule.puml</code></li>
<li>implemented in: <code>src/render/links.ts</code></li>
<li>verified by: <code>tests/integration/links.test.ts</code> (1)</li>
</ul>
<p><img alt="CL_LinksModule" src="assets/CL_LinksModule.svg"></p>
</details>

<details>
<summary><code>CL_FrontendModule</code> · traces to <code>REQ-00003-1</code> <code>REQ-00007-1</code> <code>REQ-00013-1</code> <code>REQ-00023-1</code></summary>
<ul>
<li>source: <code>design/lld/render/CL_FrontendModule.puml</code></li>
<li>implemented in: <code>src/render/frontend.ts</code></li>
<li>verified by: <code>tests/integration/cli.test.ts</code> (4), <code>tests/integration/frontend.test.ts</code> (14), <code>tests/integration/interactive.test.ts</code> (2), <code>tests/integration/links.test.ts</code> (4), <code>tests/integration/manual.test.ts</code> (4)</li>
</ul>
<p><img alt="CL_FrontendModule" src="assets/CL_FrontendModule.svg"></p>
</details>

<details>
<summary><code>CL_ActivityModule</code> · traces to <code>REQ-00024-1</code></summary>
<ul>
<li>source: <code>design/lld/render/CL_ActivityModule.puml</code></li>
<li>implemented in: <code>src/render/activity.ts</code></li>
<li>verified by: <code>tests/integration/activity.test.ts</code> (7)</li>
</ul>
<p><img alt="CL_ActivityModule" src="assets/CL_ActivityModule.svg"></p>
</details>

<details>
<summary><code>CL_StateModule</code> · traces to <code>REQ-00031-1</code></summary>
<ul>
<li>source: <code>design/lld/render/CL_StateModule.puml</code></li>
<li>implemented in: <code>src/render/state.ts</code></li>
<li>verified by: <code>tests/integration/frontend.test.ts</code> (1), <code>tests/integration/state.test.ts</code> (10)</li>
</ul>
<p><img alt="CL_StateModule" src="assets/CL_StateModule.svg"></p>
</details>

<details>
<summary><code>CL_FocusModule</code> · traces to <code>REQ-00032-1</code></summary>
<ul>
<li>source: <code>design/lld/render/CL_FocusModule.puml</code></li>
<li>implemented in: <code>src/render/focus.ts</code></li>
<li>verified by: <code>tests/integration/focus.test.ts</code> (7), <code>tests/integration/interactive.test.ts</code> (3)</li>
</ul>
<p><img alt="CL_FocusModule" src="assets/CL_FocusModule.svg"></p>
</details>

<details>
<summary><code>CL_PreprocessModule</code> · traces to <code>REQ-00034-1</code></summary>
<ul>
<li>source: <code>design/lld/render/CL_PreprocessModule.puml</code></li>
<li>implemented in: <code>src/render/preprocess.ts</code></li>
<li>verified by: <code>tests/integration/preprocess.test.ts</code> (2)</li>
</ul>
<p><img alt="CL_PreprocessModule" src="assets/CL_PreprocessModule.svg"></p>
</details>

### Module overview

#### CL_ServeModule

_cl · `design/lld/render/CL_ServeModule.puml`_

- traces to: `REQ-00011-1`
- implemented in: `src/render/serve.ts`
- verified by: `tests/integration/serve.test.ts` (6)

![CL_ServeModule](assets/CL_ServeModule.svg)
<!-- /folio -->
