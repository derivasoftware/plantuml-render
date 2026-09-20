# Working in this repository

This project is **NA**.

## Orient yourself — run this first

```bash
argos context              # artefact counts, next IDs, conventions, active diagnostics
argos tree                 # requirement DAG with status and ASIL
```

## Workflow rules

- **Every task starts with PROC-00014-2 (Start Task).** Read it before writing
  any artefact:
  ```bash
  argos get PROC-00014-2
  ```
- This project is **NA** (no ASIL declared). Agents may act as Owner
  under PROTOCOL-autonomous-loop (Autonomous Development Loop). The loop
  reads this signal from ``argos.toml [project].asil``.

- New artefacts start at DRAFT. Promote to APPROVED only after Owner sign-off.
- Commits: imperative summary of what was produced or changed.

## Definition of Done

```bash
npm test && pre-commit run --all-files
```

## Baseline diagnostics (not regressions)

- `W-DESIGN-NO-CODE` on the four `<<module>>` boxes: the drift checker
  does not yet know the module-entity convention (DDEV-246).
- Umbrella SREQs no longer fire `W-SREQ-NOT-DECOMPOSED` (child SREQs
  count as decomposition since argos 0.0.5); SREQ-00005-2 (wasm
  preview) is OBSOLETE, superseded by the serve mode (SREQ-00008-1).
- `W-CLASS-TOO-SMALL` on IrValidationError: a deliberate marker
  exception subclass.
- `W-REQ-NO-DESIGN` on REQ-00022-1 (release checksums): realised by
  scripts/checksums.sh, scripts/release.sh and the tag job, not by a code
  module, so no LLD chapter claims it; VER-00022-1 tests the script.
