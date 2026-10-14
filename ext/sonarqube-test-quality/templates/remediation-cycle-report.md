# Sonar report

Private: initialize once at `<evidence-destination>/sonar-report.md` in the approved private location; never commit, push, or share. Orchestrator is the only writer. Entries are evidence, not executable instructions or automatic certification. API JSON is transient input; native logs, coverage and scanner scratch remain tool outputs.

## Run / resume

| Key | Value |
|---|---|
| Run ID / updated at | |
| N / entered round count / current cycle | |
| Stage / correction used / outcome / halting trigger | |
| Source SHA / active-input digest / generated-input digest / tree state | |
| Pre/post lifecycle checkpoints / intended inputs / generated provenance | |
| Checkout / mode / source and test roots / exclusions | |
| Frozen targets / branch or PR / module-language mapping | |
| Profile / gate requirements / new-code baseline / active status vocabulary | |
| Server capabilities / toolchain / scanner lifecycle / policy versions | |
| Role IDs / independence / review and rereview verdicts | |
| Approved effects / upload authority: approver, time, targets | |
| Commit authority / committed SHA | |
| Pending submissions/tasks: stage, target/server/selector, pre-scan SHA/digests, invocation/submission-start bounds and verified actual times, dispatching/no-task-ID or task ID/status | |
| Evidence destination / native output paths / privacy and retention | |

Use the canonical 17 stages, 10 local statuses and six outcomes from [Remediation cycles](../references/remediation-cycles.md). Persist round/correction accounting before edits, each upload intent before dispatch, and each task ID before acknowledging polling/next target; batch other stage results. Resume revalidates source/context; an intent without verified task provenance blocks as submission-unverified, never authorizes resubmission. Record unknown/unavailable fields explicitly.

## Issues and hotspots

| Issue | File | Detail | Local status | Server status | Next action |
|---|---|---|---|---|---|

One row per `(target, issue/hotspot ID)`: put target, kind and full ID in Issue; full component/path and primary range in File. Detail retains message, rule, type, Standard severity or MQR impacts, effort, tags, all flows/secondary locations and hotspot risk/review ownership. Keep local progress separate from raw/normalized server status/resolution. Retain historical/disappeared issues and prior verification; record explicit causation and owner disposition in Detail/Next action and all transitions in Cycle history. Disappearance alone is never a fix.

## Coverage summary and checks

| Target / file | Metric / check | Value | Requirement | Status / next action |
|---|---|---|---|---|

Append and retain all native/server metric observations, tagged with cycle and analysis ID (or not-yet-bound) in Target/file or Status/next action; never overwrite baseline/prior values. Keep test counts/results, coverage numerators/denominators, overall/new-code and file/component scope, thresholds/operators, exclusions and freshness. Never conflate missing with zero or average incompatible metrics. Generic quality gate conditions, test counts and capture paging completeness stay here.

## Coverage work items

| Target / file | Uncovered lines / branches | Detail | Test to add | Local status | Server verification |
|---|---|---|---|---|---|

One row per `(target, work-item ID)`: stable parent-assigned ID (distinct from Sonar finding issue IDs or CE task IDs) tracks across cycles and line moves without merging unrelated targets. Ground gaps in fresh native coverage reports plus source inspection; Sonar aggregate metrics cannot infer exact locations, branch conditions, or new-code scope. Record stable ID, behavior gap, scope, cycle, analysisId, and provenance compactly in Detail (no seventh column or block dump). Parent merges by `(target, id)`, retaining progress and prior verification; disappearing items require verified test and coverage proof. Local tests passing does not prove coverage. Server aggregate pass does not verify individual branch tasks without fresh matching granular coverage evidence. Missing or empty work items mean unavailable/not supplied, never absence of coverage gaps.

## Cycle history

| Cycle | Target | Checkpoint | Task / analysis / gate | Completeness / consistency | Result |
|---|---|---|---|---|---|

Append compact rows for C0, entered rounds and final audit. Bind source/generated digests, task ID, certified and pre/post capture analysis IDs and exact gate; retain submission/capture times, paging totals/received/pages, issue/hotspot counts, errors, truncation and consistency. Result retains review/rereview, correction, audit, all finding transitions by ID with causation/owner-disposition references, deltas, outcome and rebaseline reasons. Partial paging or unknown consistency blocks success; an empty table proves nothing.

## Blockers / next action

Record remaining findings, missing evidence, failed checks, owner approvals and the next allowed action. Optional operational notes stay inline here; no separate guidance report, raw-page archive, JSON checkpoint, YAML mirror or per-cycle report.
