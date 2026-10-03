# VS Code Local Native Support — Progress Overview

**Overview Path:** `plans/261002-2213-vscode-local-native-support/progress.md`  
**Plan Path:** `plans/261002-2213-vscode-local-native-support/plan.md`  
**Last Reconciled:** 2026-10-03  
**Active Advice Lifecycle:** Active (`--advice` explicit mode)  
**Latest Completed Task Run ID:** `8b1b2c37-7a71-4b55-a731-afd127462626` (Phase 06)

---

## Phase Reconciliation Matrix

| Phase | Title | Captured Status | Current Status | Completion Basis / Scope | Evidence Links | Prerequisites / Blockers |
|---|---|---|---|---|---|---|
| **00** | Released Local runtime contract and fixture capture | Pending | **Completed (Live Qualified)** | Offline qualification tooling/fixtures qualified (5/5 tests passing); live native runtime verified on VS Code 1.140.0 (commit `07f806f999227108933c2e30515b26eecc1fda74`) with builtin `copilot-chat` 0.68.0 and `copilot-runtime`. Hard gate cleared. | [Completion Receipt](./reports/phase-00-completion-receipt.md) · [Contract Report](./reports/phase-00-native-contract.md) | None (Cleared). |
| **01** | Target contracts and identity | Pending | **Completed** | Eighth-target identity (`vscode`), schema 2 registry migration, legacy schema 1 reader, qualification guards, 156/156 tests passing. | [Completion Receipt](./reports/phase-01-completion-receipt.md) | None (Completed). |
| **02** | Resource projection | Pending | **Completed** | Complete instructions, 19 agents, 70 commands, 40 skills, 6 styles, 6 workflows, catalogs, directory manifest (116 skill dirs, 4 archived dirs, 0 collisions), and inventory projection (19/19 tests passing). | [Completion Receipt](./reports/phase-02-completion-receipt.md) · [Directory Manifest](./reports/phase-02-directory-manifest.md) · [Final Report](./reports/phase-02-final-report.md) | None (Completed). |
| **03** | Local hooks and policy | Pending | **Completed** | Discriminated hook protocol for 8 Agent Plugins 1.0 events, tool normalization, pure scout and privacy policies (no lexical approval trust, fail-closed unqualified tools, bare command operand inspection), Agent Plugins 1.0 `hooks.json`, CJS runtime closure, inventory audit (27/27 phase tests passing, 70/70 adapter suite passing, Score 9.4/10). | [Completion Receipt](./reports/phase-03-completion-receipt.md) · [Cycle 2 Code Review](./reports/code-review-261003-1531-vscode-phase03-hooks-policy-cycle2.md) | None (Completed). |
| **04** | Session context and lifecycle | Pending | **Completed** | Explicit root resolution, project/session isolation, atomic CAS v1 state, bounded retention (7d, 256/proj, 1024/user), honest lifecycle boundaries, CLI support scripts, 24/24 phase tests passing, 87/87 adapter tests passing (Score 9.3/10). | [Completion Receipt](./reports/phase-04-completion-receipt.md) · [Code Review](./reports/code-review-261003-1604-vscode-phase04-session-context-lifecycle.md) | None (Completed). |
| **05** | Configuration, MCP, and advisor | Pending | **Completed** | Inert user-owned configuration examples, settings disposition audit map, opt-in MCP with pinned versions and password input variables, exact model mappings (`opus`, `sonnet`, `haiku`), unsupported relay rejection (`ADVISE_AGENT_RELAY_UNSUPPORTED_VSCODE`), direct HOME advisor caller workflow, 13/13 Phase 05 tests, 73/73 targeted tests, 99/99 adapter tests passing (Score 9.3/10). | [Completion Receipt](./reports/phase-05-completion-receipt.md) · [Code Review](./reports/code-review-261003-1731-vscode-phase05-configuration-mcp-advisor.md) | None (Completed). |
| **06** | Publication and activation | Pending | **Completed** | Project/HOME publication and recovery; target isolation; collision rejection; scope recovery; aggregate build manifest (5/5 Phase 06 tests passing, 91/91 publication suite passing, Score 9.3/10). | [Completion Receipt](./reports/phase-06-completion-receipt.md) · [Publication Report](./reports/phase-06-publication-report.md) · [Code Review](./reports/code-review-261003-1916-phase-06-publication-and-activation.md) | None (Completed). |
| **07** | Automated release qualification | Pending | Pending | Regressions, package smoke, release integration | [Phase 07 Spec](./phase-07-automated-release-qualification.md) | Depends on Phase 06. |
| **08** | Native Local qualification | Pending | Pending | Real Local end-to-end multi-platform evidence | [Phase 08 Spec](./phase-08-native-local-qualification.md) | Depends on Phase 07. |
| **09** | Documentation and rollout | Pending | Pending | Accurate docs, controlled rollout, rollback | [Phase 09 Spec](./phase-09-documentation-and-rollout.md) | Depends on Phase 08. |

---

## Active Phase Summary & Next Steps

- **Completed Phases:**
  - `Phase 00`: Released Local runtime contract and fixture capture (Live Qualified, Task Run `976cde5d-1009-4f80-a3e7-9ed3470dd8f8`)
  - `Phase 01`: Eighth target, persistence and adapter contracts (Completed, Task Run `a904994f-743e-47d1-a69b-f756cdd5dac3`)
  - `Phase 02`: Complete instructions, agents, skills, commands, styles, workflows, catalogs projection, and 116-directory manifest (Completed, Task Run `7d9fe9e6-d6b8-4eff-b361-fc2a1718ecd4`, Score 10/10)
  - `Phase 03`: Native hook protocol, tool inputs normalization, pure scout/privacy policies, Agent Plugins 1.0 hooks.json, CommonJS runtime closure, and inventory audit (Completed, Task Run `040d48dd-1b4c-4954-8b21-66f45da6519e`, Score 9.4/10)
  - `Phase 04`: Explicit session/plan context, atomic CAS v1 state, bounded retention, honest lifecycle boundaries, and CLI support scripts (Completed, Task Run `14edca89-b185-4eb8-a874-ebacf987f8c4`, Score 9.3/10)
  - `Phase 05`: Inert user-owned configuration examples, settings disposition audit map, opt-in MCP with pinned versions and password input variables, exact model mappings, unsupported relay rejection, and direct HOME advisor caller workflow (Completed, Task Run `7c6266e8-ace1-4c29-a915-7355c2214ee8`, Score 9.3/10)
  - `Phase 06`: Publication and activation (Completed, Task Run `8b1b2c37-7a71-4b55-a731-afd127462626`, 5/5 Phase 06 tests, 91/91 publication suite, 99/99 adapter suite, Score 9.3/10)
- **Next Step:**
  - `Phase 07`: Automated release qualification (Phase 06 completed; Phase 07 depends on Phase 06).
