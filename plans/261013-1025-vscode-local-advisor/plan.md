---
title: "VS Code Local Advisor Extension"
description: "Independent Copilot-backed advisor tool with consented new-session guidance and bounded Pi-inspired context."
status: pending
priority: P2
effort: not-estimated
branch: feat/vscode-local-advisor
tags: [feature, vscode, copilot, advisor, api, experimental]
created: 2026-10-13
---

# VS Code Local Advisor — implementation plan

## Goal and agreed boundary

Deliver a private independent VSIX from `extensions/vscode-advisor/`. Copilot **Local / Agent** remains executor; native `evc-advisor_ask` calls a user-selected Copilot model. Consented `SessionStart` context explains invocation from the first prompt. No `xd://` adapter, system-prompt override, OMP process, or proposed API dependency.

Required support: **Linux x64 + Windows x64**, trusted local single-folder workspaces. Text-only explicit handoff and named attachments; Pi-inspired disclosure defaults, **redaction ON**. No enforced gates, transcript scraping, image support, hidden fallback, public Marketplace release, or EVCrate CLI/publication integration.

## Read first

1. [Planning brief / user decisions](planning-brief.md)
2. [Architecture and contracts](design-contracts.md) — authoritative over research
3. [Validation matrix and native runbook](validation-matrix.md)
4. [Hook delivery research](research/startup-hook-and-packaging.md) and [Pi context mapping](research/pi-context-policy.md)
5. [Prior brainstorm](../reports/brainstorm-261013-0944-copilot-local-advisor.md)

## Phases

| # | Phase | Dependency | Status / progress |
|---|---|---|---|
| 01 | [Linux-first native feasibility and support freeze](phase-01-native-feasibility.md) | None | Pending / 0% |
| 02 | [Independent package and contract foundation](phase-02-package-and-contracts.md) | 01 go | Pending / 0% |
| 03 | [Model configuration, consent and commands](phase-03-model-configuration.md) | 02 | Pending / 0% |
| 04 | [Bounded context and disclosure policies](phase-04-context-and-privacy.md) | 02 | Pending / 0% |
| 05 | [Native advisor tool and request lifecycle](phase-05-advisor-tool.md) | 03 + 04 | Pending / 0% |
| 06 | [Session-start guidance and ownership](phase-06-startup-guidance.md) | 05 | Pending / 0% |
| 07 | [VSIX packaging and integrated regression gate](phase-07-packaging-and-regression.md) | 06 | Pending / 0% |
| 08 | [Two-platform qualification and operator handoff](phase-08-native-qualification.md) | 07 | Pending / 0% |

Follow order by default. Only phases 03/04 can be parallelized after contracts freeze; one owner integrates shared manifest/contracts. Never claim a phase complete without its observable acceptance evidence. All implementation checkboxes remain unchecked.

## Release acceptance

- Final VSIX installs without proposed-API flags; no dependency on model-bindings companion.
- Fresh Local session receives guidance before first response; actual registered tool is available when enabled.
- Real tool invocation returns selected Copilot model's critique in the same executor conversation, on both required platforms.
- Default summary disclosure excludes patch/file bodies; attachments need global opt-in; redaction and budgets operate before egress.
- Disabled/untrusted/unsupported/cancelled/unavailable paths do not produce fabricated advice or silent alternate model calls.
- User-owned hooks/settings survive setup, repair, disable, removal and interrupted updates.
- Core seven-target distribution/release and existing companion remain unchanged; no automatic publication.

## Gates and evidence

Phase 01 proves Linux public API/model/startup behavior before production work. Windows feasibility may follow during implementation but remains mandatory by Phase 08, which repeats both platforms against final package hashes. Missing account/policy/native access is an explicit blocker at its gate; docs, mocks and hook stdout alone do not pass live acceptance.

Planning changed documentation only. Native hard-plan command expanded successfully. Active-plan helper could not persist because `EVCRATE_SESSION_ID` is unset; use this path explicitly in future commands. No Copilot inference or implementation performed.

## Unresolved questions

Product choices: none. Technical unknowns have explicit native gates. Effort intentionally not estimated; no delivery-date commitment.

## Validation Summary

**Validated:** 2026-10-13. **Questions asked:** 4. [Interview and checks](reports/plan-validation.md).

- Confirmed private manual VSIX; no EVCrate installer/publication integration.
- Confirmed external Node >=22.19.0 and qualified Windows PowerShell prerequisites.
- Changed gate: Linux proof unlocks implementation; Windows proof still mandatory before final completion.
- Confirmed one active call/window, 120-second deadline, no automatic retry/fallback.
- Required revision applied across phase dependencies, design and matrix; no open plan-revision items. Implementation remains pending.
