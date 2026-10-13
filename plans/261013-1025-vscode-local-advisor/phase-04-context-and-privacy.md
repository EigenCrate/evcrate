# Phase 04 — Bounded context and disclosure policies

## Context links
- [Plan](plan.md); dependency [Phase 02](phase-02-package-and-contracts.md); [design sections 4–6](design-contracts.md).
- [Pi source/default mapping](research/pi-context-policy.md); `/home/loidinh/WS/pi-advisor/docs/privacy.md` and exact source anchors in that report.

## Overview
- Date 2026-10-13. Priority P1. Implementation pending. Review pending.
- Build a complete deterministic text-evidence pipeline, preserving approved Pi policy semantics without inventing transcript access.

## Key Insights
- Explicit context is required. Empty `{}` is not a Pi-style contextual review in VS Code.
- Collection settings control automatic collection, not secret material manually pasted into a draft.
- Pi context 15000 chars is not a whole-request token limit; files/rules/draft add separate regions.
- Text-only per-call attachment consent and global rules mapping differ from Pi; document rather than hide differences.

## Requirements
- Git off/summary/full ceilings; default summary, 20000 configured Git chars limited to half 15000 shared chars.
- Tracked/untracked attachments independently off by default; exact named regular text files only after opt-in.
- Root AGENTS rules on, optional explicit global source, optional `.vscode/advisor-preferences.md`; no Pi HOME discovery.
- Redaction ON, before caps; every source labelled untrusted; actual omissions/failures exposed.
- Bounded IO/process/time/memory, Unicode-safe budgets, no network commands, context changes fail before send.

## Architecture
- Collector produces immutable prepared regions + notices, not a provider request or success verdict.
- Separate safe filesystem, hardened Git, rules, redaction, and budgeting responsibilities; one context-builder composes them.
- Pipeline: validate → authority snapshot → bounded complete collection → redact → escape → source caps → whole-message budgets/token count → authority recheck.

## Related code files
Create under `/home/loidinh/WS/evcrate/extensions/vscode-advisor/src/`:
- `context-builder.ts`, `safe-files.ts`, `git-context.ts`, `rules-context.ts`, `redaction.ts`, `context-budget.ts`, `prompts.ts`.
Modify same-root `contracts.ts`, `limits.ts` only through integration owner if freeze needs correction.
Create `/home/loidinh/WS/evcrate/tests/vscode-advisor/context-policy.test.mjs`, `git-context.test.mjs`, `safe-files.test.mjs`, `redaction-budget.test.mjs`.
No writes to real repository rules/preferences or user's Git settings.

## Implementation Steps
1. Implement validated input and immutable effective-policy snapshot using Phase 02 contracts. Preserve exact approved units/defaults; enforce new hard bounds separately. Unknown/unsupported image/history/follow-up fields fail early.
2. Build platform-aware safe text reader: root/ancestor/leaf kind checks, no symlinks/reparse traversal, bounded complete read, UTF-8 validity, descriptor identity and before/after checks. Reject special files, binary/image data and changed source. Qualify Linux and Windows behavior; do not claim hard sandboxing against hostile racing processes in a trusted workspace.
3. Resolve canonical workspace and Git top-level. Nonrepo permits explicit-text review with notice. Parent-repository mismatch withholds Git and forbids file attachments; do not broaden root to parent. Root rules remain confined to admitted workspace.
4. Implement cancellable bounded Git execution using exact argv and sanitized environment: no shell/pager/external diff/textconv/fsmonitor, no inherited root/config redirect, no network/submodule commands. Resolve Git binary per host, not model input. Share 5-second deadline and aggregate raw output cap across all commands.
5. Parse NUL-delimited status/membership and literal paths, including spaces/newlines/dashes in filenames. Cover staged+unstaged changes against HEAD; unborn repository uses a correct empty-tree base. Worktree and Windows cases use real Git scratch repos.
6. Render summary without hunk headers or body content; full adds tracked patch only within effective ceiling. Untracked names may appear but bodies never come from full diff. On failure/timeout/overflow mark failed, not no-changes; collector may continue explicit context with honest notices.
7. Implement exact attachments: verify explicit permission class, exact repository membership, nonignored untracked status, safe reader and 16-file/path limits. Permission-disabled explicit request => `DISCLOSURE_DENIED`; invalid/unsafe explicit path fails preparation. Oversized otherwise-safe optional source is withheld with bounded notice. No sibling/glob expansion, previous-advice permit or automatic follow-up call.
8. Read project/global rules and optional preferences only through safe reader. Global source requires explicit stored user selection and trusted root; enforce 8 KiB/source, 16 KiB combined rules, 8 KiB preferences. Treat their contents as review data, not executable directives. Missing optional file means absent, unreadable/unsafe means withheld with notice.
9. Adapt common-pattern redaction from Pi only after license review; no runtime dependency. Apply to complete bounded text including path labels, question and drafts before truncation. Test credential crossing boundary, line ending, Unicode and delimiter attacks. Error in redaction blocks send; warn redaction is incomplete protection.
10. Render labelled escaped untrusted regions. Respect per-source UTF-8 caps and shared UTF-16-unit context/Git budget after escaping. Draft and question each <=8 KiB; files 8 KiB each/24 KiB combined; avoid splitting encoded delimiters or surrogate pairs.
11. Enforce 128 KiB serialized request bound and model token bound via actual counting API proven in Phase 01. Apply deterministic omission order in contracts; preserve meaningful task evidence and omission notices. Required minimum not fitting => zero dispatch `CONTEXT_TOO_LARGE`. Handle zero context/Git caps without interpreting them as unlimited.
12. Return prepared request data plus sanitized metadata; reread no mutable file opportunistically after final policy check. No raw logs/caches or persisted prefixes. Ensure cancellation tears down collectors and does not forward a partially prepared payload.
13. Run deterministic tests using disposable repositories and malicious fixture paths/configs. Actual filesystem/Git commands prove no helper execution and no sibling disclosure; requests are captured at application boundary solely for policy assertions. Clean fixtures after run.

## Todo list
- [ ] Exact policy/default/cap mapping implemented.
- [ ] Linux/Windows-safe bounded text collection.
- [ ] Hardened Git summary/full and root restriction.
- [ ] Explicit attachment permission and membership checks.
- [ ] Rules/preferences mapping and trust enforcement.
- [ ] Redaction/escaping/budgets/token-count algorithm.
- [ ] Adversarial filesystem/Git/context regression coverage.

## Success Criteria
- P01–P10 privacy rows in validation matrix pass on declared platforms.
- Default request contains no automatically collected patch/file bodies and no hidden transcript.
- Workspace policy escalation, traversal, external Git helper, oversized raw input and cancellation cannot cause forbidden dispatch/disclosure.
- Redacted/escaped request stays within byte/token limits; omitted/failed collection is never portrayed as clean repository or successful visual review.

## Risk Assessment
- Redaction cannot guarantee secrecy; consent and collection minimization remain essential.
- Repository-level Git features can execute helpers unless explicitly disabled; exercise actual commands, not source-string checks.
- Oversized evidence can remove decisive context; advisor/executor must receive omission status.

## Security Considerations
- No shell interpolation from file/model input. Administrative `.git` data never eligible attachment.
- Trusted workspace is required; root/global sources rechecked before dispatch; policy revocation cancels preparation.
- No automatic provider retries or requests belong in this phase.

## Next steps
Integrate prepared-context contract with Phase 03 model selection in Phase 05. Unknown native token or filesystem semantics stop qualification; do not fabricate safety through unchecked casts.

## Unresolved questions
None after Phase 01. Any platform safety restriction must be explicit and reviewed, not silently reduce Windows acceptance.
