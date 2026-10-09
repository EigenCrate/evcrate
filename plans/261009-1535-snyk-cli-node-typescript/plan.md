---
title: "Common Snyk CLI and Node.js/TypeScript workflows"
description: "Cut the standalone bundle over to .agents and add secure CLI acquisition and lockfile-aware remediation procedures."
status: completed
priority: P2
branch: feat/snyk-cli-node-typescript
tags: [feature, security, auth]
created: 2026-10-09
---

# Preflight contract

- Output: common `.agents` specialist/skills payload; existing zero-dependency installer targets `.agents`; secure Snyk CLI login/scan/report workflow; concrete npm/Yarn/pnpm Node.js and TypeScript procedures; current usage documentation.
- Acceptance: fresh install, repeat install, collision refusal/explicit overwrite, dry-run and symlink protections work under `.agents`; npm artifact contains the complete common payload. Login is operator-owned and secret-safe. SCA and Code stay separate. Scan exit 1 preserves results; failures/omitted projects are not clean evidence. Node owner changes cover lockfiles/workspaces/peers and TypeScript build/runtime checks. HTML remains optional derived evidence, not the only entry point.
- Scope: `ext/snyk-expert/.agents/**`, package metadata, existing `bin/`, `lib/`, tests; `docs/snyk-expert-cli.md`; this new plan/reports. No EVCrate import/projection, scanner wrapper, public release, target application edit, actual login or scan without separate target/credential authority.
- Protected: earlier plans/receipts; root architecture/changelog/roadmap captured in unresolved historical runs; user's .gitignore and untracked extensions.
- Public contract risk: installer targets `.agents`; retain installer names and collision authorization. No native discovery equivalence is claimed.
- Affected systems: standalone npm packaging, Node installer, portable specialist prompt, three skills and linked references; not root TypeScript runtime.
- Verification: Node syntax checks; existing behavior suites updated to the new root (delete wording/incidental asset-count tests rather than re-pin); actual CLI install/repeat/collision/dry-run in disposable projects; pack/extract/install smoke; installed reference resolution; bounded skill scenario execution through available host. Real authenticated Snyk scans and native per-target discovery remain unqualified if required inputs absent.
- Unresolved implementation questions: none. User explicitly selected common `.agents` scope and Node.js/TypeScript scan support. Live qualification needs an authorized target, scanner, organization and secure authentication.

# Orchestration

Advice admission: native cook/auto v2 is off. Implementation child helper resolved `code` with exact plan selection and null handoff to `off / NO_FINAL_FLAG`; no advisor consulted. Slash dispatch is unavailable in the exposed tools; loaded cmd-plan/cmd-code contracts are executed inline by the implementation owner, not falsely reported as native command invocations. New ordinary plan uses this plan.md, not historical progress or controller state.

Historical receipt association: Phases 02–04 attest sealed old resource authoring only. This is a separately requested common-folder cutover; no old phase is resumed or completed, no old pending gate is bypassed. Preserve all old paths. Root docs remain untouched; new common architecture/usage: [docs/snyk-expert-cli.md](../../docs/snyk-expert-cli.md).

# Implementation phases

1. Common payload and installer: create new `.agents` resources using existing contracts; migrate all installer callers/output/package allowlist to `.agents`; update behavior tests and preserve historical files.
2. CLI skill: explicit setup authority, pinned operator installation, browser OAuth/token CI boundary, org/region/permissions, SCA and Code scan scope, exact artifacts/exits and optional HTML. Separate setup/scan from read-only analysis and gated remediation.
3. Node.js/TypeScript procedure: npm/Yarn/pnpm/workspace owner and resolved graph, precise manifest/lockfile changes, registry/peer/engine/module/native compatibility, installed TypeScript typecheck/build/tests/affected runtime, same-scope rescan.
4. Validation and review: actual installer and packed-artifact smoke; syntax and package tests; installed links and protected-byte preservation; bounded prompt scenarios; independent security/quality review. No live-finding claims from synthetic cases.
5. User approval and finalization: record actual evidence, update current docs and status after approval; ask separately whether to commit. Never commit automatically.

# Progress

- [x] Feature branch created; pre-existing changes preserved.
- [x] Rescan and official CLI research; sealed-path reconciliation; user selected `.agents`.
- [x] Common payload, CLI and Node.js/TypeScript procedures implemented.
- [x] Tests, actual smoke and independent review: [validation](reports/validation.md); 26/26 package tests passed across 6 suites, 7 syntax checks, installer/pack smoke, and constructed prompt cases. Review 9.8/10, zero critical/high.
- [x] User review approval: selected **Approve local delivery** with documented limits.
- [x] Documentation/evidence finalized: package and docs exclusively maintain `.agents/`, with legacy resources retired.
Approved final scope: common `.agents` payload, existing package installer/metadata/tests, new packaged usage and root common-bundle docs, this new ordinary plan and evidence. Plans are normally ignored; user explicitly authorized current plan/evidence in the scoped commit, so stage only this plan directory with `git add -f`. Existing staged input was empty before selection. User `.gitignore`, unrelated extensions, historical sources/plans and captured root docs excluded.

Default approval/validation only; not durable advice completion. Native slash dispatch unavailable; scoped commit contract read and applied inline, never blanket `git add .`. Temporary smoke artifacts removed. Live qualification prerequisites remain excluded, not silently passed.

# Source evidence

- [Snyk auth](https://docs.snyk.io/developer-tools/snyk-cli/commands/auth): browser OAuth default from CLI 1.1293; CI SNYK_TOKEN.
- [Snyk test](https://docs.snyk.io/developer-tools/snyk-cli/commands/test): SCA flags/exits, JSON artifacts, current version-gated HTML support.
- [Snyk Code](https://docs.snyk.io/developer-tools/snyk-cli/commands/code-test): SAST source transmission/reporting boundary; clean scans may omit JSON artifact.
- [JavaScript CLI support](https://docs.snyk.io/supported-languages/supported-languages-list/javascript/snyk-cli-for-javascript): single manifest default and workspace scope.
- [CLI installation](https://docs.snyk.io/developer-tools/snyk-cli/install-the-snyk-cli): operator prerequisites and installation methods.
