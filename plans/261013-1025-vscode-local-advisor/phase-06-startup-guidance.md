# Phase 06 — Session-start guidance and ownership

## Context links
- [Plan](plan.md); dependency [Phase 05](phase-05-advisor-tool.md); [design section 7](design-contracts.md).
- [Corrected hook research](research/startup-hook-and-packaging.md); [Local hook reference](https://code.visualstudio.com/docs/agents/reference/hooks-reference).

## Overview
- Date 2026-10-13. Priority P1. Implementation pending. Review pending.
- Make advisor availability/purpose known from the first prompt of a new Local session using consented, safely owned hooks.

## Key Insights
- Hook process lacks VS Code API/model credentials/tool registry. Keep it static context emission, never inference or a local service.
- `SessionStart` is new-session startup, not every turn; no retroactive prompt change promised.
- Independent file avoids edits to EVCrate plugin hooks and canonical harness instructions.
- Disabled/uninstalled extension can leave owned hook assets; no reliable uninstall callback. Guidance must be conditional.

## Requirements
- Commands enable/disable/remove/repair; explicit workspace writes consent; no silently enabling host hooks.
- Supported Local PascalCase event/envelope; bounded, nonblocking hook runner.
- Linux/Windows shell-safe literal paths and validated external Node; no Electron-as-Node assumption.
- Ownership survives interrupted writes/updates without deleting user modifications; settings snapshot cannot grant egress.

## Architecture
- Installer and authoritative hash receipt live in extension code/workspace state.
- Owned workspace assets: `.github/hooks/evc-advisor.json`, `.vscode/evc-advisor/hook.cjs`, `.vscode/evc-advisor/snapshot.json`.
- Runner template `assets/session-start.cjs` copied from package; no dependency on package path or current extension version directory at runtime.
- Snapshot only carries bounded guidance flags, enabled state and canonical root identity. Static tool name/required explicit handoff embedded from common owned prompt template.

## Related code files
Create under `/home/loidinh/WS/evcrate/extensions/vscode-advisor/`:
- `src/startup-installation.ts`, `src/startup-ownership.ts`, `src/startup-command.ts`, `assets/session-start.cjs`.
Modify `src/commands.ts`, `src/configuration.ts`, `src/extension.ts`, `src/prompts.ts`, `src/status.ts` and package manifest.
Create `/home/loidinh/WS/evcrate/tests/vscode-advisor/startup-runner.test.mjs`, `startup-ownership.test.mjs`, `startup-command.test.mjs`.
Existing `/home/loidinh/WS/evcrate/src/adapters/vscode/hooks.ts` and canonical/generated hooks: reference only, intentionally unchanged.

## Implementation Steps
1. Use one extension-owned startup wording source tied to the registered tool schema. Include objective/context requirement, consequential planning/failure/completion consultation, executor authority and explicit-disclosure caution. Omit transcript assumptions, empty-object advice and `xd://`.
2. Implement standalone CommonJS runner: bounded stdin <=64 KiB, strict JSON/event check, snapshot <=16 KiB, canonical root match, no transcript/rules/Git/model reads. Foreign event/corrupt/missing/disabled snapshot => `{}`, exit 0. Successful envelope includes `hookEventName: SessionStart` and bounded additionalContext <=8 KiB.
3. Conditional guidance: only call `evc-advisor_ask` when actually available/enabled; missing tool means explain unavailable and proceed without fabricated review. No Stop/PreToolUse blocking hooks, hard gates, recursion or process keepalive.
4. Validate external Node >=22.19.0 from user-approved resolved executable using argv. Use Phase 01-qualified Linux single-quote construction. Qualify Windows encoded PowerShell here or retain its explicit native gate for Phase 08; never treat Linux proof as Windows evidence. No path interpolation without platform encoder; no model input in command; reject control characters.
5. Enable command performs all preflight checks before mutation: trust/support/configured model/Node, host hook settings/location restrictions, safe destination ancestors, workspace receipt, hashes and collisions. Diagnose disabled hook policy; require user to enable it if permitted, never silently mutate settings.
6. Preview exact managed file paths and snapshot semantics, explain fresh-session requirement and machine-local paths. Ask consent. Do not alter preferences, `.gitignore`, shared hooks, EVCrate plugin manifest or editor settings. Offer manual exclusion guidance only.
7. Acquire root-scoped exclusive lock for mutation; same-root concurrent window loses with actionable BUSY result. No automatic stale-lock deletion; interrupted lock requires explicit owner/process inspection before recovery.
8. Stage same-volume files; persist pending generation/expected hashes in unsynced extension state. Publish runner/snapshot before discovered manifest; manifest last. Commit receipt only after byte identities match; enabling tool is final step. On partial failure restore known owned prior generation or preserve pending receipt and report repair required; never claim success.
9. Update/repair verifies receipt and every target hash first. Disable/remove discovered owned manifest while replacing runner/snapshot; reinstall last. User-edited file stays untouched. Missing receipt means unmanaged/manual review, not automatic adoption based on workspace marker.
10. Serialize configuration snapshot refresh with receipt updates under same lock. No partial writes or prior-generation hash mismatch after successful update. Restrict snapshot to guidance; executable reads cannot change disclosure config even if snapshot tampered.
11. Disable first marks runtime disabled and cancels active consultation; atomically updates unchanged owned snapshot to disabled. Changed snapshot remains untouched with explicit warning. Injected text from old chats cannot be withdrawn; new session required.
12. Remove verifies all ownership hashes before mutation, removes unchanged hook manifest first, then only unchanged runner/snapshot. Preserve changed/unowned files, receipts needed for repair, directories with other files; do not recursively sweep.
13. Unexpected extension disable/uninstall: runtime tool disappears but copied hook may emit conditional guidance. Document manual inspection/removal procedure with hash verification. No unconditional `rm` recipe or false claim deactivation cleans workspace automatically.
14. Test real child runner with valid/foreign/oversized/malformed event, root mismatch, disabled snapshot and missing files. Assert output schema and nonblocking behavior, not exact instruction wording.
15. Exercise install/update/cancel/partial failure/concurrent lock/unowned collision/user edit/disable/removal on scratch filesystems. Preserve sentinel sibling hooks/JSONC settings byte-for-byte; qualify Windows junction and locked-file failure paths.
16. In actual fresh Local session, observe first-turn context and tool availability. Repeat disabled hooks/tool/extension and existing-session cases. No echo-only hook smoke substitutes for host injection proof.

## Todo list
- [ ] Bounded Local-only nonblocking runner and one guidance source.
- [ ] Linux/Windows executable and command encoding.
- [ ] Consented install and external-settings diagnostics.
- [ ] Receipt/hash/lock staged mutation and recovery.
- [ ] Disable/remove/repair semantics preserve user data.
- [ ] Runner/filesystem security and concurrent lifecycle tests.
- [ ] Fresh-session native guidance proof and stale-hook limitation documented.

## Success Criteria
- Fresh Local first prompt sees guidance before response on Linux. Record Windows proof here when available; otherwise keep its native acceptance pending for mandatory Phase 08 qualification while packaging proceeds.
- No workspace change before consent; unmanaged or edited file never overwritten/deleted.
- Interrupted installation does not expose half-updated active runner or falsely enable extension.
- No credentials/privacy permissions available to runner; no process/network service.
- Missing tool and disabled state never produce claimed advice; no hook forcibly blocks executor.

## Risk Assessment
- Preview discovery/order can change: qualify exact host tuple and capture debug evidence.
- Machine-specific paths in committed hook may fail elsewhere: setup warns and repair remains explicit.
- Cross-profile state does not share receipt authority: refuse unowned existing assets rather than overwrite; support one owning profile per workspace.

## Security Considerations
- Host Workspace Trust gates hooks; extension independently checks trust before setup/inference.
- Windows shell quoting is security-critical; encoded payload is not a bypass for literal-string escaping.
- Workspace hook files are executable configuration. File ownership is not a sandbox against malicious trusted-workspace edits; detection refuses automated repair.

## Next steps
Phase 07 package and integrated regression. No further gate enhancements in this user-approved initial scope.

## Unresolved questions
Linux host questions resolved by Phase 01; Windows command/startup behavior must resolve here or in Phase 08. Unexpected host limitations require contract revision, not a hidden private API.
