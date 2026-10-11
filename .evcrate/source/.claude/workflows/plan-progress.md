# Plan Progress and Phase Reconciliation

Apply before selecting or confirming a phase, dispatching each dependency batch,
or advancing an automatic next-phase loop. Reconcile from bounded in-repository
records only. Do not consult HOME, execute historical tools, resume historical
runs, or reconstruct their runtime state.

## Authority and selection

- Ordinary unprotected plans retain normal `plan.md` status tracking after
  required user approval and actual validation. No historical receipt is needed
  merely to track a new ordinary plan.
- Protected historical plans retain sealed plan, phase, evidence, roadmap and
  selected-index identities. Their current overview is `<plan-dir>/progress.md`,
  derived and uncaptured, never completion authority, implementation permission,
  substantive write authority, or captured evidence. Missing progress does not
  mean no history. Never add navigation links to a sealed plan.
- Read selected plan/phase contracts and identified retained association,
  finalization, approval/validation receipts and sealed-path metadata. Bound each
  document read to 64 KiB. Missing, unreadable, oversize, contradictory or
  incomplete decisive records pause only affected work and dependencies; never
  truncate decisive evidence into success. Do not scan global history or select
  the newest UUID or matching phase label as authority.
- Establish exact requested scope, dependencies, existing approvals and protected
  paths before selecting incomplete work. An explicitly requested completed
  scope is a no-op: report completion and suggest the next incomplete phase,
  never execute a different scope without authorization.
- Retained unresolved gates, abandoned or interrupted work are not success.
  Unprovable association or overlap pauses the relevant work, not all independent
  work. Proven unrelated independently requested work may continue while all
  referenced sealed paths stay protected.
- Emit selected scope, completion basis, overview path and outstanding
  prerequisites. Keep historical completion, current status, validation scope
  and native qualification distinct. Use `plan.md` for ordinary plans and
  `<plan-dir>/progress.md` for protected historical plans.

## Historical association, completion and freshness

Keep three independent judgments: **association**, **recorded completion**, and
**current workspace freshness**. These are reconciliation findings, not new
persistent state fields.

1. Establish association from retained repository-relative plan/phase paths,
   exact approved scope, project provenance, completion identity, evidence
   revisions, reviewed artifacts, actual validation and sealed metadata.
   Relocation can change local root identity; retained provenance may establish
   repository association, but never manufacture a matching identity. A bare
   UUID or common phase label proves nothing.
2. Protect exact sealed historical paths and selected-index identities. Verify
   retained digests when a dependency needs that proof; a digest alone does not
   preserve original bytes. If necessary evidence is unavailable, report
   last-recorded success separately and pause dependent proof rather than
   re-capturing or rerunning completed work.
3. Distinguish ordinary approval/validation receipts from durable historical
   completion receipts. Ordinary receipts must say
   `default approval/validation; not durable advice completion`; they do not
   manufacture historical completion. A complete matching historical receipt
   permits completed-scope no-op or the dependency it actually attests. Report
   `receipt-attested; controller not consulted` for that historical basis.
   It establishes past approved completion only, not write permission, current
   freshness, or detection of contradictions outside the retained records.
4. Match all applicable receipts against approved scope, retained completion
   identity, reviewed evidence, revisions, actual validation and sealed digest.
   Missing or contradictory decisive records block the affected prerequisite.
   An identified historical run without a matching receipt pauses same or
   overlapping selected scope and dependents; never infer success from display
   status. Abandonment is not completion.
5. Report current file/index drift separately. Do not erase historical success
   because freshness is unavailable, nor grant fresh dependency proof from old
   success. Never refresh sealed baselines, repair selected Git state, remove
   captured paths, overwrite evidence, or rerun completed work to manufacture
   consistency.

| Finding | Selected scope |
|---|---|
| Ordinary unprotected plan | Normal approval, validation and tracking |
| Complete matching historical receipt and sealed metadata | Completed requested scope is a no-op; evidence supports only attested dependencies |
| Identified history without receipt, same/overlapping scope | Affected work and dependents pause; no automatic resume or substitution |
| Proven unrelated interrupted history | Independent requested scope continues; sealed paths remain protected |
| Bare UUID or ambiguous association | No authority; establish relevance from retained records |
| Abandoned work | Not successful completion; affected prerequisite unresolved |
| Historical completion with current drift | Preserve history; assess required freshness independently |
| Missing, contradictory, incomplete or oversize decisive record | Report known status and exact proof gap; no fabricated reconstruction |

## Parent-only receipt and overview publication

Reconciliation itself writes nothing administrative. Publication is a separate,
authorized parent action. One parent owns immutable receipts and serializes
uncaptured overview updates across all children and batches; children return
terminal reports and actual changed paths, not receipt or overview edits.

- Publish new ordinary completion only after required approval and actual
  validation of the executed scope. For a new ordinary phase on a protected
  historical plan, use
  `<phase-id>-default-<scope-revision-label>-completion-receipt.md` under its
  authorized reports directory, explicitly marked
  `default approval/validation; not durable advice completion`, with approved
  scope and actual validation links. Do not invent historical run or operation
  identities. Preserve all existing receipts unchanged.
- Receipt and overview destinations must remain outside captured baseline,
  selected index transitions and substantive evidence/write sets. If a
  destination is already captured, stop publication and report the conflict;
  never remove it from protection to permit a write. Reuse a receipt only when
  its full identity and content match; contradictory same-identity evidence
  blocks publication. Use immutable receipts, never mutable progress, as proof.
- Reread relevant records and update only authorized uncaptured `progress.md`
  from reconciled evidence. Distinguish captured/current status, completion
  basis, executed scope, validation, next phase and unresolved blockers. Do not
  copy DONE into sealed snapshots or broaden permissions through an overview.
- Reconstructing a missing receipt requires separate parent authorization and
  separately available full retained evidence. Display assertions, digests
  without bytes, or an overview cannot manufacture durable historical completion
  or resolve missing/contradictory proof.
- Publication failure does not reopen successful implementation. Report
  `phase complete; progress publication failed` with the known scope and
  evidence. Next invocation reconciles first and repairs only authorized
  uncaptured administrative outputs; never rerun completed implementation for
  display repair. Existing captured paths and writer ownership remain binding.
