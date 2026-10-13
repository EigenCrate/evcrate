# Validation interview — approved revised scope

Date: 2026-10-12. Four substantive questions; user answered all. Implementation remains pending.

## Confirmed decisions

- Install to both `.agents/skills/` and `.claude/skills/` as explicitly selected roots. The clarifying question rejected a shared `.agents`-only interpretation.
- No new live Sonar gate for extension implementation. Follow supplied historical report procedure/lessons; do not misrepresent historical results as new-extension runtime proof.
- Keep plans local and Git-ignored. Tracked architecture contains self-contained proposed design, no links to ignored artifacts; no ignore edits/force-staging/commit.

## Revised implementation instructions

[Authoritative addendum](../validation-decisions.md) gives exact agents/claude/both CLI selection, per-root mapping, shared/legacy lock coordination, cross-root rollback/negative cases, root-versus-host/duplicate-discovery checks and replacement historical-report/offline Phase 08 acceptance. [Overview](../plan.md) and [navigation](../evc-cmd-plan.md) prominently set precedence.

Per interview workflow, original phase files remain snapshots. Their contradictory agents-only/live-gate text is expressly superseded; this is not approval to skip required package/host/eval/docs proof or weaken consumer actual-server success semantics.

## Advisor revision disposition

Adopted: inventory supersession across phases/contracts/matrix/research; distinguish roots from runtime identities; qualify actual loaded paths and duplicate discovery; shared lock only coordinates participating installers, with deterministic legacy agents lock guard; no crash/reader-visibility promise; historical report identity/limits explicit; old agents install unchanged and both-root writes explicit; remove tracked ignored-plan links.

## Verification boundary

Earlier [receipt](plan-validation.md) records prior-snapshot artifact checks, original worktree identity/Git visibility and unchanged extension source. No extension code was edited during this interview. No implementation tests, package/host installation, live credentials/scans/server tasks, commit or push performed. New root modes and transaction guarantees are planned, not implemented.

## Recommendation / unresolved questions


Revised artifact validator executed after all approved revisions: 18 planning artifacts, 126 relative links, zero broken links; eight phase snapshots retain required section order and pending status. Overview 69 LOC, navigation 20 LOC. Addendum/precedence/dual-root/no-new-live-gate clauses checked; new tracked architecture section has zero links to ignored plan artifacts. These are planning checks only.
Proceed later with Phase 01 and this approved addendum. All user design choices resolved. Actual host discovery/eval capability remains an implementation fact to exercise; real Sonar access is a future remediation-run prerequisite, not extension-completion gate.
