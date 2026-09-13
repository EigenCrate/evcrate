# Phase 03 — Neutral Seven-Target Runtime Closures and Structured HOME Rules

## Context links

- [Master plan](./plan.md)
- [Design contracts §§4–5](./design-contracts.md)
- [Acceptance A11–A12, A19–A27](./acceptance-matrix.md)
- [Pre-plan §§2.4, 3.1–3.8](../reports/pre_plan_scope_distribute.md)
- [CLI/adapter research §§Seven adapter/runtime closures](./research/researcher-01-cli-protocol-adapters.md)
- Current generated-boundary authority: `docs/system-architecture.md` §2; `docs/code-standards.md` generated ownership rules

## Overview

- **Date:** 2026-09-12
- **Description:** Make all seven generated runtime closures installation-relative and workspace-correct while confining HOME path binding to structured publication rules.
- **Priority:** P2
- **Implementation status:** DONE (2026-09-12; 100%)
- **Review status:** Approved (2026-09-12)

## Key Insights

- Neutral projection is already the single build boundary; scope-specific adapter outputs would violate current architecture.
- Codex and Gemini wrappers now derive child hooks from installation-relative locations; Antigravity no longer searches ancestors.
- Copilot registration/status and bridge lookup now derive from the installed hierarchy; active workspace data remains separate.
- OMP child hooks and global config root now derive from the runtime/resource module location.
- Pi derives EVCrate resources from the loaded extension location; `PI_CODING_AGENT_DIR` remains third-party discovery only.
- Codex HOME TOML handling now parses the expected generated assignment strictly; Antigravity no longer rewrites global commands at build time.

## Requirements

1. Preserve one neutral projection per target and unchanged `ProjectionBuildContext`.
2. Registration locates installed wrapper; wrapper locates children from its own module/file location.
3. Workspace `cwd` and target/Claude project environment variables remain active-workspace data.
4. Remove every ancestor search for installed EVCrate children.
5. HOME transformations parse known documents and rewrite only validated command fields/prefixes; project copies neutral registration/config bytes.
6. Keep safety hooks fail closed on missing, non-regular, or symlinked children; preserve paths containing spaces.
7. Extend closed HOME rule ownership in manifests/types for Claude, Codex, Gemini, Antigravity, and Copilot; retain OMP mapping and Claude root-skill exclusion.
8. Do not regenerate checked-in projections in this phase; Phase 08 performs source-derived regeneration after focused proof.

## Architecture

### Runtime dataflow

`vendor registration → installed wrapper path → self-relative child path validation → vendor payload workspace extraction → child spawn {cwd: workspace, project env: workspace, EVCrate roots: installed location}`

### Materialization states

| Artifact | Neutral build | HOME publish | Project publish |
|---|---|---|---|
| Registration/config | project-relative/native command | validated command fields rebound to HOME destination | copied unchanged |
| Wrapper child path | self/module-relative | unchanged | unchanged |
| Workspace cwd/env | payload/vendor project | remains active workspace | remains active workspace |
| Hook body | neutral transformed adapter output | never arbitrary-rewritten | unchanged |

## Related code files

- **Modify** `src/adapters/claude.ts`: `buildClaude`/settings validation as needed; canonical settings remain neutral.
- **Modify** `src/adapters/codex/hooks.ts`: `contextBridge`, `pretoolBridge`, `hooksJson`; self-relative child and workspace split.
- **Modify** `src/adapters/codex/index.ts`: generated `config` assignment remains neutral.
- **Modify** `src/adapters/gemini/runtime.ts`: `bridge`, `projectHooks`, `projectSettings`.
- **Modify** `src/adapters/antigravity.ts`: `wrapper`, remove `rewriteGlobalHooks`, `build`; payload/env workspace without ancestor search.
- **Modify** `src/adapters/copilot/hooks.ts`: `bridgeCommand`, `convertHooks` neutral registrations/status line.
- **Modify** `src/adapters/copilot/bridge.ts`: `BRIDGE_SOURCE` installed config root and child checks.
- **Modify** `src/adapters/omp/templates.ts`: `OMP_RUNTIME_HELPER` config root from runtime/resource module.
- **Modify canonical Pi overlay** `.evcrate/targets/pi/files/agent/extensions/evcrate/index.js`: `evcrateExtension` derives location-owned root.
- **Modify canonical Pi overlay** `.evcrate/targets/pi/files/agent/extensions/evcrate/paths.js`: separate installed EVCrate root from third-party `PI_CODING_AGENT_DIR` discovery.
- **Modify** `src/manifests/types.ts`: `HOME_PUBLICATION_RULES` closed enum.
- **Modify** `.evcrate/targets/{claude,codex,gemini,antigravity,copilot,omp}/manifest.json`: explicit target-owned rule declarations only.
- **Modify** `src/distribution/publication-rules.ts`: `assertPublicationRules`, `publishFile`; structured JSON/generated-TOML command transformations.
- **Modify** `src/distribution/publication.ts`: compare validated target selections as sets at the publication boundary so canonical protocol ordering cannot reject the all-target installed path.
- **Phase 07 tests:** `tests/adapters/contracts.test.mjs`, publication plan tests, integration fixtures.

Generated `.evcrate/source/.agents`, `.codex`, `.gemini`, `.antigravity`, `.pi`, `.omp`, `.copilot`, registry, and manifests are explicitly not hand-edited.

## Implementation Steps

1. Implement a consistent generated-wrapper pattern: compute child from `__dirname`/module URL, verify regular non-symlink file and safe ancestry, derive workspace separately.
2. Claude: retain canonical project-relative settings; add allowlisted HOME rewrite for `statusLine.command` and `hooks.*[].hooks[].command` only when validated neutral prefix matches.
3. Codex: make context/pre-tool children basenames under wrapper directory; preserve `CODEX_PROJECT_DIR || cwd` for spawn cwd and Codex/Claude env. Keep hooks JSON and MCP TOML neutral.
4. Replace Codex HOME handling with structured hook-command parsing and a generated-assignment parser that accepts exactly the expected `run-mcp-package.sh` TOML command; reject zero/multiple/shape drift.
5. Gemini: self-relative children with regular/non-symlink validation; retain Gemini/Claude workspace env and spawn cwd; structured HOME native hook command rewrite.
6. Antigravity: delete build call and function for `rewriteGlobalHooks`; retain sibling `.original.cjs`; select workspace from validated payload paths/cwd then explicit env/cwd fallback, never ancestors; set Claude/Gemini/AGY vars and spawn cwd.
7. Add Antigravity HOME rule mapping validated `.antigravity/hooks` command prefix to actual `.gemini/config/hooks` destination.
8. Copilot: neutral bridge/status-line commands; derive bridge, children, status line, and `EVCRATE_GLOBAL_CONFIG_ROOT` from installed file hierarchy; keep payload cwd as Copilot/Claude workspace.
9. OMP: derive global/config root from `SOURCE_HOOK_ROOT`/resource module layout and remove `os.homedir()` dependency.
10. Pi: derive EVCrate root from `import.meta.url`/loaded extension directory; retain `PI_CODING_AGENT_DIR` normalization solely before third-party registration/discovery.
11. Add closed target-to-rule ownership checks and reject malformed/unexpected command documents instead of falling back to body replacement.
12. Handoff canonical source changes to Phase 07 proof; Phase 08 regenerates outputs once.

## Todo list

- [x] Neutralize Claude settings materialization boundary.
- [x] Make Codex wrappers self-relative and TOML/JSON rewrites structured.
- [x] Make Gemini wrappers self-relative and settings rewrite structured.
- [x] Remove Antigravity ancestor/global build rewrite; add HOME mapping.
- [x] Neutralize Copilot bridge/status/config-root lookup.
- [x] Derive OMP config root from module/resource location.
- [x] Derive Pi EVCrate root from installed extension location.
- [x] Freeze closed HOME rule ownership without arbitrary body rewrite.
- [x] Leave generated outputs untouched for Phase 08.

## Success Criteria

- Each neutral projection is usable from HOME or project without rebuilding.
- Invoking installed wrappers from a third workspace resolves installed children and passes the third workspace as cwd/project env.
- Missing/symlink children preserve target-specific fail-closed behavior; paths with spaces work.
- Neutral registrations contain no HOME-only path; no wrapper walks ancestors.
- HOME transforms change only allowlisted command fields; project bytes remain neutral.
- `ProjectionBuildContext` contains no scope/publication fields.

## Completion evidence

- Approved implementation and review corrections complete: all seven canonical runtime closures are installation-relative; active workspace `cwd` and project environment remain workspace data; HOME rewrites are structured and target-owned.
- Approved corrections: `.evcrate/targets/claude/manifest.json` declares `claude-home-path-rewrite`; `src/adapters/gemini/runtime.ts` rejects malformed or non-object declared settings with `VALIDATION_INVALID`.
- Focused regressions cover `tests/adapters/contracts.test.mjs` (seven-target contracts and Gemini malformed/non-object settings), `tests/distribution/publication-plan.test.mjs` (closed rule ownership and Claude HOME settings), and `tests/distribution/publication-parity.test.mjs` (Claude rule expectation). `npm run test:adapters` passed 24/24.
- `npm run build` passed. Source-derived temporary validation in an isolated copy, after manifest generation there, passed `npm run test:publication` 54/54 and `npm run test:integration` 14/14.
- The all-target installed CLI path now also accepts canonical protocol target ordering at the publication boundary. After source-derived manifest and release-asset preparation in an isolated copy, the complete `npm test` sequence passed with zero failures, including the installed rollout and distribution checks.
- Direct canonical publication/integration checks can report stale checked-in generated metadata. This is a Phase 08 handoff limitation for those checked-in artifacts: generated projections, `.evcrate/build-manifest*.json`, `.evcrate/targets/manifest.json`, registry, and release artifacts remain untouched and Phase 08-owned.

Planned focused verification after implementation:

```sh
npm run build
npm run test:adapters
npm run test:publication
npm run test:integration
```

## Risk Assessment

- **Failure:** vendor command schemas differ subtly. **Mitigation:** validate exact known generated shapes and reject drift; fixtures per target.
- **Failure:** self-relative path depth is wrong after HOME mapping. **Mitigation:** execute materialized wrappers from both destination layouts and a third cwd.
- **Failure:** removal of Antigravity search loses workspace context. **Mitigation:** explicit ordered payload/env contract with deterministic fallback to current cwd only.
- **Performance:** repeated child safety walk per hook call. **Mitigation:** bounded short installed path; correctness dominates; no speculative cache.

## Security Considerations

- Never execute a symlink/special/missing child.
- Treat payload workspace as untrusted path input; validate directory before cwd use.
- Do not allow HOME transform prefixes to rewrite user-authored arbitrary strings.
- Keep environment allowlists/credential behavior unchanged; only path authority changes.
- Pi’s third-party discovery variable must not regain authority over EVCrate-owned files.

## Next steps/handoffs

- Phase 04 consumes the finalized structured materialization API.
- Phase 07 owns runtime/field-preservation fixtures and focused execution proof.
- Phase 08 alone owns regeneration and validation of checked-in generated projections, `.evcrate/build-manifest*.json`, `.evcrate/targets/manifest.json`, registry, and release artifacts after source/runtime proof; no such outputs change in this phase.
