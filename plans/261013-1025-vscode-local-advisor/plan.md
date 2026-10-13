---
title: "VS Code Local Advisor Extension"
description: "Independent Copilot-backed advisor tool with consented new-session guidance and bounded Pi-inspired context."
status: pending
priority: P2
effort: not-estimated
branch: main
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
| 01 | [Native feasibility and support freeze](phase-01-native-feasibility.md) | None | Pending / 0% |
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

Phase 01 resolves API/type availability, model authorization, Windows command quoting and first-turn ordering before production work. Phase 08 repeats against final package hashes. Account credentials/policies and native Windows access are execution prerequisites, not claims from this planning session. Docs/API inspection, mock tests and hook JSON output alone do not pass live gates.

Planning changed documentation only. Native hard-plan command expanded successfully. Active-plan helper could not persist because `EVCRATE_SESSION_ID` is unset; use this path explicitly in future commands. No Copilot inference or implementation performed.

## Unresolved questions

Product choices: none. Technical unknowns are explicit Phase 01 stop/go checks. Effort intentionally not estimated; no delivery-date commitment. Optional plan-validation interview is recorded in `reports/plan-validation.md` when completed or declined.
