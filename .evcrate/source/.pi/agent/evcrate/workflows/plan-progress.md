# Plan Progress and Phase Reconciliation

Apply before selecting/confirming a phase, dispatching each dependency batch, or advancing an automatic next-phase loop. This neutral contract never requires full mentoring. Activation is resolved separately by `advice-activation.md`; historical records, checkpoint names and blockers cannot activate or resume advice.

## Authority and selection

- Ordinary plans without advice-controlled evidence retain normal `plan.md` tracking after required approval and actual validation. No controller state or receipt requirement merely for tracking.
- Protected historical plans retain sealed plan/phase/evidence/index identities in every mode. Their current overview is `<plan-dir>/progress.md`, derived and uncaptured, never completion authority, implementation permission, checkpoint evidence, or an authorized substantive path. Missing progress does not mean no history.
- Read selected plan/phase contracts, retained handoff/finalization records, receipts and supplied caller context. Bound discovery to identified dependency records, not a global history scan, newest UUID, table status or phase-label equality. Each document read is at most 64 KiB; unavailable/oversize decisive evidence blocks the affected prerequisite, never silently truncated into success.
- Preserve any unresolved selected-scope gates. Only a validated direct same-run handoff enables deliberate continuation under the separately loaded mentoring lifecycle. Without it, same-scope pending/correction/stale/human gates pause affected work and dependents without activating advice, refreshing state, choosing a replacement UUID, switching phases, or routing through a gate-bypass debugger/workflow. Proven unrelated independently requested work may continue; referenced sealed paths remain protected.
- Establish dependencies and existing approvals before selecting incomplete scope. Explicitly requested completed scope is a no-op: report completion and suggest the next incomplete phase, never auto-execute a different phase. Unprovable association/overlap pauses relevant work, not an assumption of unrelated scope.
- Emit selected scope, completion basis, overview path and outstanding prerequisites. Ordinary overview: `plan.md`; advice/protected overview: `<plan-dir>/progress.md`. Keep captured wording, reconciled current status, validation scope and native qualification distinct.

## Identified get-only retrieval

A candidate run from retained records permits inspection, not lifecycle mutation. Invoke only the existing HOME-owned `evcrate-advisor` with supported Node, argv `state`, `get`, exact UTF-8 JSON stdin, and the agreed project root as cwd:

```json
{"protocol":"evcrate-advisor-state","version":1,"operation":"get","task_run_id":"<identified UUID>","operation_id":null,"expected_revision":null,"payload":{}}
```

- POSIX requires valid absolute HOME and invokes `node "$HOME/.evcrate/bin/evcrate-advisor" state get`; no generic no-argument dispatcher or project runtime lookup.
- Native Windows uses explicit HOME when set (invalid explicit HOME fails), otherwise nonempty USERPROFILE then native user profile. Invoke Node with the absolute script path. PowerShell 5.1 saves `$OutputEncoding`, sets BOM-free UTF-8 for piped JSON, and restores it in `finally`.
- Programmatic callers use actual supported Node, `[absoluteController, 'state', 'get']`, `shell: false`, explicit cwd, bounded stdout/error/close handling, and `stdin.end(jsonPayload, 'utf8')`. Bun's executable is not Node. Never interpolate raw task/JSON into shell commands.
- Require exit 0 and one complete matching `evcrate-advisor-state` version 1 / `operation:get` / `status:STATE_READY` envelope, validated state, matching run and canonical project identity/root. Missing/unsupported/malformed state, uncertain/live locks or mismatched identity blocks dependent verification. Do not manually delete locks, retry as inference, initialize, or refresh to obtain success.
- Existing get acquires/releases short locks and may reap provably dead locks; it leaves durable state/ledger/history unchanged. Do not claim filesystem-side-effect-free inspection. Pending process observation is not permission to recover/relaunch its consultation. Get does not assert current baseline freshness or publish administrative outputs.

No neutral operation calls init, checkpoint/reservation, claim/attachment, inference, disposition, outcome, complete, human-decision, pending recovery, or baseline refresh. A lifecycle must be separately and deliberately activated; neutral findings never synthesize a direct caller handoff.

## Historical association and completion

Keep independent judgments: **association**, **recorded completion**, **current workspace freshness**. These are reconciliation results, not new durable fields.

1. Establish canonical root/project ID and exact run from validated state. Match selected repository-relative plan/phase paths, controller phase, approved scope and retained handoff/receipt evidence. State has no structured plan ID; a UUID, receipt assertion or shared `phase-01` label alone proves none.
2. Establish association from captured task/evidence paths and retained reviewed artifacts whose full-file digests match the captured snapshot. A digest does not retain original bytes. If necessary retained content is unavailable, report last-recorded success separately and pause dependent proof rather than re-capture or rerun completed work.
3. Genuine success requires an actual `complete` operation in `operation_ledger`, not only `gate_status:completed` (abandonment also sets it). Match operation ID/revision/digest to the existing canonical state-request hash for that run, empty payload and `expected_revision = entry.revision - 1`. Reuse `state-contract.cjs`'s `hash` (recursive sorted-key canonical JSON plus SHA-256), never ordinary insertion-order JSON hashing or a second state protocol.
4. Match the accepted disposition and resolved outcome to the last successful terminal consultation, checkpoint/result evidence, task/evidence/scope revisions, approved paths and sealed baseline digest. Verify the existing completion invariants without executing complete: no pending consultation/correction/unresolved episode; resolved outcome with current evidence revision, matching consultation/result digest and `hash(current_baseline)`; accepted disposition for the same last consultation and `last_terminal.status:ADVICE_READY`. Verify retained checkpoint/result identity and declared actual validation as well.
5. Identify abandonment from retained human-decision/ledger evidence; never call human-decision to inspect it. Match the receipt's full completion identity and authorized scope against durable state and retained reviewed evidence. Conflicts/stale receipt claims block automatic selection and are not overwritten.
6. Report current file/index drift independently from historical success. Never silently refresh baseline, repair selected Git state, remove captured paths, overwrite evidence or manufacture consistency by rerunning completed work. Deny dependencies needing unavailable snapshot/freshness proof while preserving historical completion.

| Finding | Advice without flag/handoff | Selected scope |
|---|---|---|
| Ordinary unprotected plan | off | Normal approval/validation/tracking |
| Verified successful completed scope | off | No-op if requested; retained evidence may establish dependencies |
| Proven unrelated interrupted run | off | Independent scope continues; referenced sealed paths protected |
| Bare UUID without association | off | No authority; establish relevance from retained records |
| Same unresolved controlled scope | off | Affected work/dependents pause; no automatic resume or substitution |
| Ambiguous association/overlap or missing prerequisite | off | Relevant selected work pauses |
| Abandoned run | off | Not successful completion; prerequisite unresolved |
| Completed historical scope with live drift | off | Preserve history; assess required freshness separately |
| Missing receipt and sufficient durable/retained proof | off | Separately authorized parent reconstruction only |
| Missing receipt and insufficient proof, or contradictory receipt | off | Report last-recorded status and missing/conflicting proof; no rerun/overwrite |

## Receipt and overview publication

Retrieval/reconciliation itself writes nothing administrative. Publication is a separate authorized parent action; one parent owns receipts and serializes overview updates across all children/batches.

- Before first capture of a new advice plan, link `plan.md` to `progress.md` and retain plan/phase/run association in task/evidence/handoff. Never add a link to a previously sealed plan. Ordinary plans need no nonexistent progress link.
- Keep mutable overview and planned receipt destinations outside `task.authorized_paths`, `baseline_paths`, checkpoint evidence/artifacts and selected Git transitions. Cite immutable receipts, never mutable progress. If a destination is already captured, stop publication and report the conflict; never remove it from the manifest.
- Only after successful controller `state complete`, publish an immutable receipt under `<plan-dir>/reports/`: project/plan/phase, approved scope, run, completion operation/revision, evidence revision, accepted disposition/resolved outcome, sealed baseline digest, retained reviewed evidence and actual validation. Preserve the completion response or an exact durable reference; do not invent identity or claim digest retains bytes. Substantive writes and selected index/commit transitions must already be settled before final outcome/seal.
- First receipt may use `<phase-id>-completion-receipt.md`; further scopes/runs use `<phase-id>-<task-run-id>-completion-receipt.md`. Reuse only a full matching completion identity; contradictory same-identity receipt blocks publication. Keep all prior receipts immutable and reconcile all applicable scope receipts.
- New **off-mode** phases on protected plans require no durable controller operations. After ordinary approval/validation, publish `<phase-id>-default-<scope-revision-label>-completion-receipt.md`, explicitly `default approval/validation; not durable advice completion`, with actual approved scope and validation links. No invented controller IDs. Preserve sealed plan, roadmap, historical paths and selected index identities.
- Then reread and update uncaptured `progress.md` from reconciled evidence, preserving unresolved/conflicting records and distinguishing captured/current status, completion basis, scope, evidence, next phase and blockers. This bounded administrative publication alone is permitted after sealing; no captured file or selected-index changes, broadening of permission, or copying DONE into sealed snapshots.
- Missing receipt plus sufficient verified durable and retained evidence permits separately authorized reconstruction only. Receipt/overview alone cannot resolve unavailable or contradictory controller evidence.
- Publication failure does not reopen successful completion. Report `phase complete; progress publication failed` with known run/revision. On the next invocation reconcile first, repair only authorized uncaptured administrative outputs, and do not rerun implementation or initialize a run merely to repair display. Another active run's writer barrier/capture still binds publication.
