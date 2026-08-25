# Requirements & status

## What was asked

The system requirements, with a check for implemented and one per test
suite. No argos reader models TypeScript yet, so the implemented column
and the verification test ids read from that gap (the eleven
W-VER-DEAD-TEST-ID findings say the checker cannot see vitest tests,
not that they are missing): the junit evidence below is what the last
run actually executed.

<!-- folio: sreqs --junit test-results/junit.xml -->
| SREQ | Title | Implemented | UT | ST |
| --- | --- | --- | --- | --- |
| `SREQ-00001-1` | The tool shall render diagrams as deterministic SVG from the render-IR contract | ? | ~ | ? |
| `SREQ-00002-1` | The render-IR schema shall define the origin-neutral drawing contract under semver | ? | ✓ | ? |
| `SREQ-00003-1` | The engine shall emit byte-deterministic themable SVG | ? | ✓ | ? |
| `SREQ-00004-1` | The frontend shall project the PlantUML class subset into the render-IR | ? | ✓ | ? |
| `SREQ-00005-2` | The extension shall render previews self-contained through the wasm grammar | ✗ | ✗ | ✗ |
| `SREQ-00006-1` | The engine shall render sequence diagrams | ? | ✓ | ? |
| `SREQ-00007-1` | The renderer shall support interactive read-only views | ? | ✓ | ? |
| `SREQ-00008-1` | The renderer shall serve the interactive preview over local HTTP | ? | ✓ | ? |
<!-- /folio -->

## Total traceability

<!-- folio: matrix --junit test-results/junit.xml -->
| SREQ | Requirements | Diagrams | Classes | UT | ST | Verifications |
| --- | --- | --- | --- | --- | --- | --- |
| `SREQ-00001-1` | — | `HLD_PlantumlRender` | — | 0 | ? | — |
| `SREQ-00002-1` | `REQ-00001-1`<br>`REQ-00004-1` | `CL_CliModule`<br>`CL_IrModule`<br>`CL_IrValidationError`<br>`CL_Render` | `IrValidationError`<br>`render.cli`<br>`render.engine`<br>`render.filters`<br>`render.frontend`<br>`render.ir`<br>`render.sequence`<br>`render.serve`<br>`render.shared` | 2 | ? | `VER-00001-1`<br>`VER-00004-1` |
| `SREQ-00003-1` | `REQ-00002-1` | `CL_EngineModule`<br>`CL_Render`<br>`CL_SharedModule` | `render.cli`<br>`render.engine`<br>`render.filters`<br>`render.frontend`<br>`render.ir`<br>`render.sequence`<br>`render.serve`<br>`render.shared` | 1 | ? | `VER-00002-1` |
| `SREQ-00004-1` | `REQ-00003-1` | `CL_FrontendModule`<br>`CL_Render` | `render.cli`<br>`render.engine`<br>`render.filters`<br>`render.frontend`<br>`render.ir`<br>`render.sequence`<br>`render.serve`<br>`render.shared` | 1 | ? | `VER-00003-1` |
| `SREQ-00005-2` | — | — | — | 0 | ? | — |
| `SREQ-00006-1` | `REQ-00008-1`<br>`REQ-00009-1`<br>`REQ-00010-1` | `CL_Render`<br>`CL_SequenceModule` | `render.cli`<br>`render.engine`<br>`render.filters`<br>`render.frontend`<br>`render.ir`<br>`render.sequence`<br>`render.serve`<br>`render.shared` | 3 | ? | `VER-00008-1`<br>`VER-00009-1`<br>`VER-00010-1` |
| `SREQ-00007-1` | `REQ-00005-1`<br>`REQ-00006-1`<br>`REQ-00007-1` | `CL_EngineModule`<br>`CL_FiltersModule`<br>`CL_FrontendModule`<br>`CL_Render` | `render.cli`<br>`render.engine`<br>`render.filters`<br>`render.frontend`<br>`render.ir`<br>`render.sequence`<br>`render.serve`<br>`render.shared` | 3 | ? | `VER-00005-1`<br>`VER-00006-1`<br>`VER-00007-1` |
| `SREQ-00008-1` | `REQ-00011-1` | `CL_Render`<br>`CL_ServeModule` | `render.cli`<br>`render.engine`<br>`render.filters`<br>`render.frontend`<br>`render.ir`<br>`render.sequence`<br>`render.serve`<br>`render.shared` | 1 | ? | `VER-00011-1` |
<!-- /folio -->
