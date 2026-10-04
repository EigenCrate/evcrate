# Advisor Node-only launch — plan entrypoint

[Full plan and decisions](plan.md) · [Common launch contract](architecture-contract.md) · [Darwin runtime contract](darwin-runtime-contract.md) · [Acceptance matrix](acceptance-matrix.md)

| Phase | Status | Progress |
|---|---|---|
| [01 Baseline and contract](phase-01-baseline-contract.md) | Pending | 0% |
| [02 Node-only callers](phase-02-node-only-callers.md) | Pending | 0% |
| [03 Linux launch verification](phase-03-linux-launch-verification.md) | Pending | 0% |
| [04 Darwin native build](phase-04-darwin-native-build.md) | Pending | 0% |
| [05 Darwin runtime integration](phase-05-darwin-runtime-integration.md) | Pending | 0% |
| [06 Package and Linux qualification](phase-06-package-linux-qualification.md) | Pending | 0% |
| [07 Native Windows qualification](phase-07-native-windows-qualification.md) | Pending | 0% |
| [08 Documentation and handoff](phase-08-documentation-handoff.md) | Pending | 0% |

Implement in dependency order. Each phase defines parallel edit ownership and parent-run gates. No implementation started by this planning task.

macOS: actual runtime work plus user-approved build-only helper packaging; no macOS runtime tests or qualification. Windows: native host tests of the identical Linux-qualified candidate. No Linux direct-execution fallback.

## Unresolved prerequisites

Approved source snapshot, native Windows environment, controlled Apple build producer/SDK/process-API source pins. Session active-plan persistence unavailable; use the full [plan path](plan.md) explicitly.
