---
title: "All-project advisor history in DamHopper"
description: "Enable explicitly authorized owner-wide advisor history and project filtering without weakening project, policy or evaluation isolation."
status: in-progress
priority: P1
effort: 32h (provisional; subject to contract and deployment qualification)
branch: main
tags: [feature, frontend, backend, api, auth, security]
created: 2026-09-24
---

# All-project advisor history in DamHopper

## Goal and evidence

DamHopper currently displays only the evcrate project's 27 consultations; user observed 230 across 21 project-ID directories. Current history context binds one canonical target (`plugin/backend/binding.cjs`), scanner reads that ID alone (`history-scanner.cjs`), host wildcard grants cover *configured host targets*, not every historical directory. See [source review](./reports/summary-review.md), [domain research](./research/history-domain.md), [host research](./research/host-authorization.md), and [proposed architecture](../../docs/system-architecture.md#proposed-cross-project-history-design-not-implemented). This is a new authorization mode, not a dev-mode patch.

## Repository roots and ownership

- **EVCrate:** `/home/loidinh/WS/evcrate/` — this plan, advisor history producer, plugin data contract, worker, embedded viewer, and package. File paths labeled **EVCrate** in phases are relative to this root.
- **DamHopper:** `/home/loidinh/WS/dam-hopper-ws/feat-plugin-platform/` — host API/auth, Rust runner/registry, plugin SDK, host UI, and deployment. File paths labeled **Host** in phases are relative to this root, **not** `/home/loidinh/WS/dam-hopper/` from the older cross-repo contract.
- Both repositories need coordinated contract/artifact versions and independent tests before the paired release; changing EVCrate alone cannot expose all histories in the installed host.

## Decision

The trusted EVCrate plugin installation binds the owner-account history root once. Every authenticated DamHopper account may read that root's advisor histories by default; no historical project registration or per-account grant is required. Host/runner verify login, installation, owner root, scope and revocation on each invocation. This deliberately exposes every retained project's consultation contents to current and future authenticated users of that server; it does not grant anonymous access, repository files, or credentials. Never treat the existing configured-target `*` grant or browser-provided paths as authority.

Worker scans eligible owner-controlled SHA-256 project directories into one bounded snapshot. History and Overview default to All Projects and filter by discovered project ID. EVCrate should save a bounded, safe display name keyed by the canonical project ID when future consultations are written; approved existing names can be used, and older unknown projects show an abbreviated ID. Names never grant access or replace IDs. Keep separately authorized Configuration (current account policy) and Evaluations (bound corpus) visible with prominent source labels that say they are not filtered by History. Preserve on-disk execution/outcome history v1; version the strict plugin data contract and pair host/worker/iframe rollout.

## Phases

| # | Phase | Status | Est. | Deliverable |
|---|---|---|---|---|
| 00 | [Production auth guard and development compatibility](./phase-00-secure-auth-prerequisite.md) | DONE (2026-09-24) | 4h | Preserve intentional dev/test token path; prevent missing production MongoDB config from silently enabling it. |
| 01 | [Freeze scope and data contract](./phase-01-cross-project-contract.md) | DONE (2026-09-24) | 6h | Versioned scope/grant/query/inventory contract, parity fixtures, rollout pairing. |
| 02 | [Host root authorization and context](./phase-02-host-authorization-context.md) | DONE (2026-09-24) | 7h | Install-bound owner root; authenticated actor admission and runner reauthorization. |
| 03 | [Worker root history provider](./phase-03-worker-history-provider.md) | Pending | 8h | Safe bounded scan, persisted safe project names, filtered metrics/pages/detail and cursors. |
| 04 | [Project filter UI and metadata](./phase-04-project-filter-ui.md) | Pending | 4h | All Projects selector, per-project counts/table labels, honest scope. |
| 05 | [Integrated qualification and release](./phase-05-cross-repo-qualification.md) | Pending | 3h | Negative authorization, real 21-project scenario, paired deployment/rollback. |

## Dependencies / invariants

- Sequence 00 → 01 → {02,03 after contract freeze} → 04 → 05. Only source owners edit their repository; host SDK and domain schemas pinned together at paired install. No implementation in this planning task.
- Non-root/project context remains exact single SHA-256 identity. Root mode cannot read outside the approved owner history root, grant another actor, or infer identity from a path basename. Scanned execution project/task/consultation IDs must match directory IDs.
- Snapshot selection and count/metric/page/detail provenance must agree; project changes invalidate cursors and in-flight UI data. Partial scans are labeled incomplete, never claim all 230. Existing budget/deadline/stale semantics and owner-safe file checks remain.
- Production normally uses MongoDB; keep explicit development/test token behavior. `main.rs:333-344` also sets `db=None` when MongoDB environment variables are absent, and `auth.rs:355,476` currently issues tokens in that state without requiring explicit dev mode. Gate this fallback so misconfigured production cannot enable it. LAN test-server success is not production authorization proof.

## Validation gates

Contract parity and rejection fixtures in both repositories; targeted worker, Rust host, viewer, browser and paired packaged integration; negative anonymous/expired/wrong-installation/unbound-root/revoked/cursor/changed-detail checks; live deployment on a trusted installed owner runner with accepted scan counts compared against a contemporaneous baseline (230/21 are observations, not constants).

## Validation Summary

**Validated:** 2026-09-24. **Questions presented:** 7 across initial and clarification prompts; user gave final answers in chat: access for every authenticated account, safe EVCrate-persisted names with unknown fallback, and keeping Configuration/Evaluations with explicit source labels. User confirmed intentional development token bootstrap and MongoDB-backed production.

### Confirmed Decisions
- One installed owner-root binding gives every authenticated account All Projects by default; no historical workspace registration. Production MongoDB login stays required; explicit development/test token path stays functional.
- Persist a safe project display name for future EVCrate advisor consultations, keyed by project ID; existing unrecognized IDs remain visibly unknown.
- Configuration and Evaluations remain separately authorized and clearly labeled as current policy or bound evaluation source; History's project selector does not filter them.

### Action Items
- [ ] Align host installation/root admission, worker producer name metadata, UI source labels, and development-mode auth gates with these decisions.

## Unresolved questions

- Deployment still requires the trusted plugin installation to bind the real owner history root/UID. It must not require manually registering every historical project or granting individual authenticated accounts.
- Final scan budgets and latency gate require measured fixture/live evidence before contract freeze; do not silently raise existing ceilings.
