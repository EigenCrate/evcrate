# Phase 02 — Independent package and contract foundation

## Context links
- [Plan](plan.md); dependency [Phase 01](phase-01-native-feasibility.md) GO; [design contracts](design-contracts.md).
- Existing `/home/loidinh/WS/evcrate/docs/code-standards.md`, `/home/loidinh/WS/evcrate/scripts/build-typescript.mjs`, `/home/loidinh/WS/evcrate/package.json`.

## Overview
- Date: 2026-10-13. Priority P1. Implementation pending. Review pending.
- Establish isolated build/package ownership and pure behavioral contracts used by model, context and startup work.

## Key Insights
- Existing companion uses proposed `chatPromptFiles`; do not import it or copy its custom ambient declaration file.
- No generic extension framework, root advisor revival, extra adapter or auto-installation integration is needed.
- This phase is an intermediate implementation dependency, not a shippable empty extension; final acceptance requires all phases.

## Requirements
- Independent TypeScript CommonJS-compatible extension runtime and ordinary Node test conventions.
- Exact public VS Code type version and engine minimum from Phase 01.
- Runtime dependencies zero unless justified by a concrete safety/API need. Native `vscode` is host-provided.
- Exact tool IDs, commands, policy keys, limits, result/error semantics and workspace support rules frozen before phases 03/04.

## Architecture
- `contracts.ts`, `limits.ts`, `errors.ts`, `host-guard.ts` are host-light modules; pure contracts testable without VS Code.
- `extension.ts` is thin lifecycle composition; no activation-time I/O beyond local state discovery and registrations.
- Extension has its own package/lockfile; root scripts invoke it explicitly, without changing root npm workspace topology.
- Compiler uses existing `build-typescript.mjs` driver; TypeScript inputs and emitted output remain extension-owned. Package artifact outside input tree.

## Related code files
Create under `/home/loidinh/WS/evcrate/extensions/vscode-advisor/`:
- `package.json`, `package-lock.json`, `tsconfig.json`, `.vscodeignore`, `LICENSE`, `NOTICE` if adapted code requires attribution.
- `src/contracts.ts`, `src/limits.ts`, `src/errors.ts`, `src/host-guard.ts`, `src/extension.ts` (complete registration composition delivered across dependent phases).
Modify existing `/home/loidinh/WS/evcrate/package.json`: explicit `build:vscode-advisor`, `test:vscode-advisor` scripts only at this phase.
Create `/home/loidinh/WS/evcrate/tests/vscode-advisor/contracts.test.mjs`, `host-guard.test.mjs`.
Do not modify existing companion, adapters, manifests, registry or generated sources.

## Implementation Steps
1. Record frozen IDs in one constants module: extension `eigencrate.evcrate-advisor`, tool `evc-advisor_ask`, reference `evcAdvisor`, command IDs under `evcrate.advisor`.
2. Create independent manifest, pinned compatible dev dependencies (`@types/vscode`, TypeScript if independently required, packaging tool later). No `enabledApiProposals`. Declare unsupported untrusted/virtual workspace capability; runtime checks remain authoritative.
3. Configure strict TS compile output and maps into extension-local `dist/`, incremental metadata under root `.cache/evcrate/vscode-advisor/`. Ensure compiler receipt can prune only extension-owned output. Do not change root `src` include boundaries.
4. Add explicit root build script invoking existing compiler driver with extension tsconfig. Add focused Node test script using built pure modules; keep later package commands distinct.
5. Implement strict tool-input parsing: required nonblank context; optional typed fields; exact enums; unknown key refusal; per-field/aggregate bounds; deduped path count. Distinguish raw input limits from redacted egress budgets.
6. Implement configuration parser and immutable policy snapshot types, exact model selection identity, collection notices, bounded result metadata, and stable error categories. No phantom Pi history/tool-policy/same-model settings.
7. Implement support guard: Windows/Linux x64, exactly one local `file:` folder, trusted workspace, no remote authority. Normalize URI/canonical filesystem root using platform path rules; reject empty/relative/UNC/device ambiguity rather than silently using HOME.
8. Define side-effect contract: guarded failure performs no repository reads, no Git subprocess, no model request, no workspace-file mutation. Package import has no tool registration until activate is called.
9. Add behavior tests for invalid/unknown input, nonblank requirement, zero and max budgets, malformed policies, Windows drive normalization, unsupported roots, scope escape, trusted/unsupported transitions. Test observable behavior, not source text or copied constants.
10. Compile and run focused tests once after implementation is integrated. Record contract decisions in plan-local `reports/interface-freeze.md`; any later public contract change must update this file and affected phase acceptance.

## Todo list
- [ ] Freeze native IDs and supported API version.
- [ ] Add isolated package/build boundaries and explicit root scripts.
- [ ] Implement input/policy/result/error contracts.
- [ ] Implement local host/workspace guard.
- [ ] Exercise rejection boundaries and platform path semantics.
- [ ] Record reviewed interface freeze for phases 03/04.

## Success Criteria
- Extension compiles against real public types, with no proposal declarations.
- Root control-plane compile/import boundaries unchanged.
- Invalid/unsupported requests are rejected before any protected side effect in behavior tests.
- Precise shared contracts permit phases 03/04 to proceed without guessing names, units or precedence.

## Risk Assessment
- VS Code types may diverge from docs: use Phase 01 pinned evidence, not assertions/casts hiding missing APIs.
- Cross-package module resolution can leak root imports: inspect compiled runtime closure and tests.
- Setting defaults and runtime validation may drift: single implementation authority, generated manifest values only where justified.

## Security Considerations
- Workspace trust cannot be replaced by checking URI scheme alone.
- Reject unsafe model/workspace inputs before invoking OS/LM services.
- No provider secrets stored; Copilot authorization belongs to host.

## Next steps
Phases 03 and 04 may run independently after the interface freeze. One integration owner owns manifest and shared contract changes. All implementation remains pending until performed.

## Unresolved questions
None after Phase 01 interface freeze. Missing API/type support reopens that gate, not a proposed-API workaround.
