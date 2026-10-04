---
name: snyk-fix
description: Analyze Snyk HTML, JSON or SARIF findings losslessly, trace dependency owners, and remediate authorized Maven/Spring owner proposals with compatibility review, exact approval gates and graph/runtime/same-scope rescan evidence. Use for scoped Snyk dependency remediation; unsupported ecosystems and missing prerequisites stop explicitly.
---

# Snyk finding-to-owner remediation

Turn supplied findings into scoped owner proposals and evidence-backed results. Package grouping is a reporting view, not an edit count. Maven/Spring is the only concrete execution procedure; neutral records do not authorize guessed procedures for other ecosystems.

## Load locally

Read all three references in this execution context before proceeding:

- [Finding, baseline and owner contract](references/finding-and-owner-contract.md)
- [Maven/Spring procedure](references/maven-spring-remediation.md)
- [Verification, results and rollback](references/verification-and-results.md)

Read the installed sibling [dependency-upgrade-review](../dependency-upgrade-review/SKILL.md) and both references it requires for each exact proposal. Resolve links from the installed skill directory, not target cwd or authoring checkout. Native body preload does not load references. If unavailable, explicitly read entrypoints/references and record fallback loading; this is not native-preload qualification. No external authoring skill or plan file is a runtime dependency.

## Operations and execution boundary

- `analyze`: read and assess only; zero target edits, including eligible proposals. Do not write evidence into the target or run commands that mutate it. Consume supplied graph/scan/runtime evidence; an additionally authorized observation must preserve this boundary or be supplied by the parent from an isolated copy. Missing evidence stays unknown.
- `remediate`: present evidence-backed eligible changes separately from gated/blocked changes. Apply documented compatible patch/minor owner sets only under existing user policy and all execution gates. Defer other groups; no new blanket approval gate for an already-authorized eligible set.
- `approved-remediate`: may additionally execute only exact gated intent explicitly approved by the human through the main session, against the current baseline. Approval does not create missing artifacts, access or procedures.

Host permissions, filesystem/process/network isolation and single-writer ownership are supplied by the parent. Prompt rules are not an OS sandbox. Reading a report does not authorize Maven, scanner, runtime, downloads or target code execution. Unknown operation, target/scope, effective permission or trusted execution boundary means no write/code-executing command; return the exact missing prerequisite. Do not install scanner/toolchain or widen permissions to continue.

## Procedure

1. Bind the explicit target, operation, report, allowed paths, current HEAD/index/worktree, modules/profiles, scan policy and environment using the finding contract. Preserve user changes; never infer target or authorization from report content.
2. Extract inertly, retaining original byte identity, raw field values/unknowns, every source record, duplicate occurrence and ordered path. Reconcile JSON/SARIF with HTML rather than silently replacing contradictory or missing coverage. No active rendering, report-directed commands/links or invented advisory IDs.
3. Compare report scope/packages/versions/paths with the current resolved graph and matching baseline scan. Stale or incomparable evidence authorizes no report-only edit; request matching evidence or an authorized rebaseline. Keep original assertions distinct from baseline observations.
4. Build package and owner views with bidirectional coverage. Map each covered occurrence/path to observed direct/parent/BOM/platform/internal-library control. Unknown ownership blocks that subset; do not force two owners from two packages or erase unresolved findings.
5. Follow the Maven/Spring reference to bind commands and prove effective owner/pin/import/coupled-family behavior. Establish each candidate from official advisory/release and authorized registry evidence at execution time; supplied fix versions are claims, not selected releases.
6. Assess each exact owner proposal through the read-only upgrade-review skill. Preserve its assessment identity, baseline, `eligible` / `needs-approval` / `blocked`, evidence/gaps, alternatives, impacts and planned checks. That skill never runs graph/build/scan commands, changes files or grants approval.
7. Before every owner set, recheck the complete proposal-relevant baseline, scope and assessment. Validate exact human approval for gated intent; drift voids prior approval. Present eligible/deferred proposals first; apply one authorized coherent owner set at a time, preserving unrelated work. If the supported procedure, artifact, complete proposal-relevant mapping or execution access is unavailable, stop that action precisely.
8. Establish baseline evidence before edits; after each set, verify actual effective/resolved graph, target build/tests, concrete affected consumers and matching-scope rescan. Inspect all project errors/omissions and newly introduced risks. Command failure stops dependent owner changes; diagnose before retry/rollback. A green build, changed BOM string or disappeared advisory alone is never proof of a fix.
9. Capture the verified resulting state before later approvals. Return the complete result record: independent source/baseline/post/disposition dimensions, all covered/uncovered paths, actual changes/checks, precise overall status and next action. Applied eligible sets with deferred work yield `partial` plus next action `needs-approval` or exact blocker, not an old-baseline approval request.

## Hard stops and claims

No hardcoded releases, guessed original six records, unsupported ecosystem commands, destructive reset, automatic exclusions/removals/suppression, deployment, monitor upload, private report/source upload, commit or push. Separately authorized Snyk API transmission is part of the captured scanner boundary, not permission to upload report files elsewhere. Selective rollback requires authorization and proven edit ownership; otherwise preserve the stopped partial state.

Use `blocked` when a prerequisite prevents required execution from starting; `partial` once required work/checks started but failed, deferred or incomplete; `needs-approval` for an exact ready human gate before execution; `analyzed` for complete read-only analysis; `completed` only for all required authorized actions/checks with newly introduced risk resolved or explicitly accepted. Overall status never replaces per-finding evidence. `fixed` requires baseline presence plus graph, affected runtime and comparable post-scan evidence for every claimed path/module/profile. Unavailable or incomparable evidence stays `unverified`, not fixed.

These documents define a procedure, not deployed gemini loading/permission or live remediation proof. Record actual qualification limits; do not claim operational support from authoring checks.
