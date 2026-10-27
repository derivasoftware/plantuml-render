# Requirements & status

## What was asked

The system requirements, with a check for implemented (its requirements
land on diagrams that resolve to code) and one per test suite: the junit
evidence is what the last run actually executed.

<!-- folio: sreqs --junit test-results/junit.xml -->
| SREQ | Title | Implemented | UT | ST |
| --- | --- | --- | --- | --- |
| `SREQ-00001-1` | The tool shall render diagrams as deterministic SVG from the render-IR contract | ~ | ~ | ? |
| `SREQ-00002-1` | The render-IR schema shall define the origin-neutral drawing contract under semver | ✓ | ✓ | ? |
| `SREQ-00003-1` | The engine shall emit byte-deterministic themable SVG | ✓ | ✓ | ? |
| `SREQ-00004-1` | The frontend shall project the PlantUML class subset into the render-IR | ✓ | ✓ | ? |
| `SREQ-00005-2` | The extension shall render previews self-contained through the wasm grammar | ✗ | ✗ | ✗ |
| `SREQ-00006-1` | The engine shall render sequence diagrams | ✓ | ✓ | ? |
| `SREQ-00007-1` | The renderer shall support interactive read-only views | ✓ | ✓ | ? |
| `SREQ-00008-1` | The renderer shall serve the interactive preview over local HTTP | ✓ | ✓ | ? |
| `SREQ-00009-1` | The engine shall render activity diagrams | ✓ | ✓ | ? |
| `SREQ-00010-1` | The engine shall render state diagrams | ✓ | ✓ | ? |
<!-- /folio -->

## Total traceability

<!-- folio: matrix --junit test-results/junit.xml -->
| SREQ | Requirements | Diagrams | Classes | UT | ST | Verifications |
| --- | --- | --- | --- | --- | --- | --- |
| `SREQ-00001-1` | `REQ-00014-1`<br>`REQ-00021-1`<br>`REQ-00022-1`<br>`REQ-00023-1`<br>`REQ-00028-1`<br>`REQ-00029-1` | `CL_CliModule`<br>`CL_FrontendModule`<br>`CL_NotDrawnNotice`<br>`HLD_PlantumlRender` | `render.cli`<br>`render.frontend` | 42 | ? | `VER-00014-1`<br>`VER-00021-1`<br>`VER-00022-1`<br>`VER-00023-1`<br>`VER-00028-1`<br>`VER-00029-1` |
| `SREQ-00002-1` | `REQ-00001-1`<br>`REQ-00004-1`<br>`REQ-00017-1` | `CL_CliModule`<br>`CL_IrModule`<br>`CL_IrValidationError`<br>`CL_Render`<br>`CL_SharedModule` | `IrValidationError`<br>`render.activity`<br>`render.cli`<br>`render.engine`<br>`render.filters`<br>`render.focus`<br>`render.frontend`<br>`render.ir`<br>`render.links`<br>`render.preprocess`<br>`render.sequence`<br>`render.serve`<br>`render.shared`<br>`render.state` | 18 | ? | `VER-00001-1`<br>`VER-00004-1`<br>`VER-00017-1` |
| `SREQ-00003-1` | `REQ-00002-1`<br>`REQ-00012-1`<br>`REQ-00015-1`<br>`REQ-00016-1` | `CL_EngineModule`<br>`CL_Render`<br>`CL_SharedModule` | `render.activity`<br>`render.cli`<br>`render.engine`<br>`render.filters`<br>`render.focus`<br>`render.frontend`<br>`render.ir`<br>`render.links`<br>`render.preprocess`<br>`render.sequence`<br>`render.serve`<br>`render.shared`<br>`render.state` | 20 | ? | `VER-00002-1`<br>`VER-00012-1`<br>`VER-00015-1`<br>`VER-00016-1` |
| `SREQ-00004-1` | `REQ-00003-1`<br>`REQ-00013-1`<br>`REQ-00020-1`<br>`REQ-00030-1`<br>`REQ-00033-1`<br>`REQ-00034-1` | `CL_EngineModule`<br>`CL_FrontendModule`<br>`CL_PreprocessModule`<br>`CL_Render` | `render.activity`<br>`render.cli`<br>`render.engine`<br>`render.filters`<br>`render.focus`<br>`render.frontend`<br>`render.ir`<br>`render.links`<br>`render.preprocess`<br>`render.sequence`<br>`render.serve`<br>`render.shared`<br>`render.state` | 75 | ? | `VER-00003-1`<br>`VER-00013-1`<br>`VER-00020-1`<br>`VER-00030-1`<br>`VER-00033-1`<br>`VER-00034-1` |
| `SREQ-00005-2` | — | — | — | 0 | ? | — |
| `SREQ-00006-1` | `REQ-00008-1`<br>`REQ-00009-1`<br>`REQ-00010-1`<br>`REQ-00019-1`<br>`REQ-00026-1`<br>`REQ-00027-1` | `CL_IrModule`<br>`CL_Render`<br>`CL_SequenceModule` | `render.activity`<br>`render.cli`<br>`render.engine`<br>`render.filters`<br>`render.focus`<br>`render.frontend`<br>`render.ir`<br>`render.links`<br>`render.preprocess`<br>`render.sequence`<br>`render.serve`<br>`render.shared`<br>`render.state` | 22 | ? | `VER-00008-1`<br>`VER-00009-1`<br>`VER-00010-1`<br>`VER-00019-1`<br>`VER-00026-1`<br>`VER-00027-1` |
| `SREQ-00007-1` | `REQ-00005-1`<br>`REQ-00006-1`<br>`REQ-00007-1`<br>`REQ-00017-1`<br>`REQ-00018-1`<br>`REQ-00032-1` | `CL_EngineModule`<br>`CL_FiltersModule`<br>`CL_FocusModule`<br>`CL_FrontendModule`<br>`CL_IrModule`<br>`CL_LinksModule`<br>`CL_Render`<br>`CL_SharedModule` | `render.activity`<br>`render.cli`<br>`render.engine`<br>`render.filters`<br>`render.focus`<br>`render.frontend`<br>`render.ir`<br>`render.links`<br>`render.preprocess`<br>`render.sequence`<br>`render.serve`<br>`render.shared`<br>`render.state` | 30 | ? | `VER-00005-1`<br>`VER-00006-1`<br>`VER-00007-1`<br>`VER-00017-1`<br>`VER-00018-1`<br>`VER-00032-1` |
| `SREQ-00008-1` | `REQ-00011-1` | `CL_Render`<br>`CL_ServeModule` | `render.activity`<br>`render.cli`<br>`render.engine`<br>`render.filters`<br>`render.focus`<br>`render.frontend`<br>`render.ir`<br>`render.links`<br>`render.preprocess`<br>`render.sequence`<br>`render.serve`<br>`render.shared`<br>`render.state` | 6 | ? | `VER-00011-1` |
| `SREQ-00009-1` | `REQ-00024-1`<br>`REQ-00025-1` | `CL_ActivityDiagrams`<br>`CL_ActivityModule` | `render.activity` | 8 | ? | `VER-00024-1`<br>`VER-00025-1` |
| `SREQ-00010-1` | `REQ-00031-1` | `CL_Render`<br>`CL_StateModule` | `render.activity`<br>`render.cli`<br>`render.engine`<br>`render.filters`<br>`render.focus`<br>`render.frontend`<br>`render.ir`<br>`render.links`<br>`render.preprocess`<br>`render.sequence`<br>`render.serve`<br>`render.shared`<br>`render.state` | 11 | ? | `VER-00031-1` |
<!-- /folio -->
