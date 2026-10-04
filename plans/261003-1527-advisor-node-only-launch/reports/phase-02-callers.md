# Phase 02 Evidence: Migrated Callers and Interim Gate Outcomes

- **Project Root:** `/home/loidinh/WS/worktrees/evcrate-advisor-node-only-launch`
- **Plan:** `plans/261003-1527-advisor-node-only-launch/plan.md`
- **Phase ID:** `phase-02`
- **Phase Title:** `Migrate all maintained callers to explicit Node`
- **Date:** `2026-10-04`
- **Status:** Caller migration and review complete; parent owns durable phase closeout.
- **Review:** 9.8/10; no critical issues ([review report](./code-review-261004-1424-advisor-node-only-callers.md)).

---

## Migrated Caller Inventory

Line numbers refer to current source.

| Caller | Migrated lines / launch sites | Disposition |
|---|---|---|
| Canonical workflow `.evcrate/source/.claude/workflows/advisor-mentoring.md` | Host policy/table 81–108; PowerShell snippet 111–140; Node caller/boundary 142–149; ten Bash examples at 369, 398, 474, 545, 572, 599, 625, 655, 689, 720 | All use explicit Node plus the absolute controller path. HOME validation, BOM-free PowerShell stdin, Node argv/UTF-8 guidance retained. |
| Advisor skill `.evcrate/source/.claude/skills/advisor-strategy/SKILL.md` | 31 | Node on all supported hosts; tool-less counsel-agent boundary retained. |
| Brief contract `.evcrate/source/.claude/skills/advisor-strategy/references/brief-contract.md` | 25 | Node and UTF-8 JSON stdin on all supported hosts; 14-field checkpoint unchanged. |
| `README.md` | 247–250 | Direct invocation note uses Node, valid absolute HOME, JSON stdin, and canonical workflow pointer. |
| `scripts/consult-advisor-phase-e02.mjs` | HOME check/path 6–11; init 81; checkpoint 199; inference 212; get 227 | All four calls use `spawnSync(process.execPath, [bin, ...args])`; inference uses `[bin]`. |
| `scripts/consult-advisor-phase-e03.mjs` | HOME check/path 6–11; init 81; checkpoint 212; inference 225; get 240 | Same Node argv pattern. Both scripts fail closed for absent, empty, or non-absolute `HOME`; neither was executed. |
| `tests/advisor-controller/controller.test.cjs` | `spawnController` 76–78; `run` 79–80 | Both use `process.execPath` plus `[CONTROLLER]`; platform launcher branch removed. |
| `tests/advisor-controller/mentor-brief.test.cjs` | `resultFail` 752; `resultSuccess` 781 | Both use `process.execPath` plus `[CONTROLLER]`. |
| `tests/advisor-controller/retry-orchestration.test.cjs` | `res` 920 | Uses `process.execPath` plus `[CONTROLLER_BIN]`. |
| `tests/advisor-controller/smoke-30s.cjs` | `child` 49 | Uses `process.execPath` plus `[CONTROLLER]`. |

Only launcher selection changed in test helpers; platform-specific IPC/signal handling, detached provider behavior, and watchdogs remain. No production controller change, new invoker, or protocol change.

---

## Generated Output and Projections

- `npm run build` ran the runtime-brief generator. The brief-contract edit at line 25 is outside the canonical mentor-instructions block; review confirms output identity unchanged. Current generated brief digest: `16505a41eea260aefa64509602d3b3770b9c7f7c2e7520df5238edfbd91a294b`; build identity: `evcrate-advisor-v2-16505a41eea260ae`.
- Distribution generation synchronized 24 projection files: 22 across the eight manifest-declared targets and two Codex companion files under `.agents/`.

| Target | Projection paths under `.evcrate/source/` |
|---|---|
| `antigravity` | `.antigravity/workflows/advisor-mentoring.md`; `.antigravity/skills/advisor-strategy/SKILL.md`; `.antigravity/skills/advisor-strategy/references/brief-contract.md` |
| `claude` | `.claude/workflows/advisor-mentoring.md`; `.claude/skills/advisor-strategy/SKILL.md`; `.claude/skills/advisor-strategy/references/brief-contract.md` |
| `codex` | `.codex/workflows/advisor-mentoring.md` |
| `copilot` | `.copilot/evcrate/workflows/advisor-mentoring.md`; `.copilot/skills/evcrate-advisor-strategy/SKILL.md`; `.copilot/skills/evcrate-advisor-strategy/references/brief-contract.md` |
| `vscode` | `.evcrate-vscode/evcrate/workflows/advisor-mentoring.md`; `.evcrate-vscode/skills/advisor-strategy/SKILL.md`; `.evcrate-vscode/skills/advisor-strategy/references/brief-contract.md` |
| `gemini` | `.gemini/workflows/advisor-mentoring.md`; `.gemini/skills/advisor-strategy/SKILL.md`; `.gemini/skills/advisor-strategy/references/brief-contract.md` |
| `omp` | `.omp/evcrate/workflows/advisor-mentoring.md`; `.omp/skills/advisor-strategy/SKILL.md`; `.omp/skills/advisor-strategy/references/brief-contract.md` |
| `pi` | `.pi/agent/evcrate/workflows/advisor-mentoring.md`; `.pi/agent/skills/advisor-strategy/SKILL.md`; `.pi/agent/skills/advisor-strategy/references/brief-contract.md` |
| Codex companion (not a ninth target) | `.agents/skills/advisor-strategy/SKILL.md`; `.agents/skills/advisor-strategy/references/brief-contract.md` |

All nine `.evcrate/build-manifest*.json` files regenerated: generic plus `antigravity`, `claude`, `codex`, `copilot`, `gemini`, `omp`, `pi`, and `vscode`.

---

## Validation Outcomes

| Command | Result |
|---|---|
| `npm run build` | Pass per review; prebuild generators and TypeScript compilation succeeded. |
| `npm run distribute:build` | Projection batch regenerated. |
| `npm run test:protocol` | Pass, 53/53. |
| `npm run test:advisor-controller` | Pass, 234 passed; 24 skipped. |
| `npm run test:adapters` | Pass, 109/109. |
| `npm run test:cli` | Pass, 64 passed; 1 skipped. |
| `npm run distribute:check` | Pass, `{"status":"ok"}` across eight targets. |

Test total: 460 passed, 0 failed, 25 skipped (24 advisor-controller; 1 CLI). These are source/build/projection gates, not installed runtime qualification. No `npm run release:check` result is recorded for Phase 02.

---

## Boundaries and Unresolved Questions

- E02/E03 consult scripts were intentionally not run. No installed lifecycle, provider, Windows, or macOS runtime qualification is claimed; runtime verification belongs to later phases.
- Review identified 20 pre-existing untracked Snyk files under `.evcrate/source/`; upstream reconciliation is required before Phase 06/07 qualification.
- This report records implementation, review, and interim gates; it is not a durable controller completion receipt. Parent owns completion/progress reconciliation.

Unresolved: Who owns and when will the 20 pre-existing Snyk files be reconciled upstream before Phase 06/07?
