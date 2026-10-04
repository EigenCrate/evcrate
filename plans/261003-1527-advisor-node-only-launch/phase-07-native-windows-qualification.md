# Phase 07 — Native Windows qualification

## Context Links
- [Architecture contract](architecture-contract.md); [Darwin contract](darwin-runtime-contract.md); [acceptance matrix](acceptance-matrix.md).
- [Platform research](research/platform-qualification.md); [baseline](research/repository-baseline.md); [caller inventory](research/caller-inventory.md).
- [Immutable candidate producer](phase-06-package-linux-qualification.md); [documentation handoff](phase-08-documentation-handoff.md).
- [Existing Windows release matrix](../../.github/workflows/release.yml); [package command authority](../../package.json).

## Overview
- Date: 2026-10-03. Priority: P1.
- Implementation: pending. Review: pending. All commands/scenarios below are future gates, not observed results.
- Dependency: Phase 06 has a complete Linux-qualified frozen archive, every-file manifest, receipt and preauthored Windows-safe test harness.
- Outcome: native Windows advisor qualification for the exact candidate on all four Node/PowerShell rows; separate automated headless and actual human-console evidence.

## Key Insights
- WSL reports Linux; changing `process.platform` or skipping Win32 tests is not native qualification. Require actual `process.platform === 'win32'` and x64 Windows; record OS build.
- Existing `windows-2025` release work checks installer/version lifecycle. Installer success alone proves neither advisor transport nor state/history/provider supervision.
- Outer advisor launcher is always Node plus the HOME-owned script. Provider package `.cmd` fixtures exercise existing Windows backend resolution, not an advisor fallback.
- `runner.test.cjs` has POSIX `ps` assumptions; avoid repository-wide controller wildcard and `npm test` on Windows. Execute the explicit portable/native list below plus complete installed lifecycle.
- Automated headless human-gate rejection is required. A hosted runner normally cannot produce positive human-console evidence; missing console access remains a blocked requirement, never implicit PASS.

## Requirements
- Matrix: **Windows PowerShell 5.1 × Node 22.19.0**, **5.1 × 24.21.0**, **PowerShell 7 × 22.19.0**, **7 × 24.21.0**. Pin Node exactly; record actual PowerShell 7 patch and binary. No reduced matrix without explicit user approval.
- Use ordinary user-owned native paths, no admin/developer-mode/symlink privilege requirement. Keep desktop/UAC/SmartScreen/enterprise/ARM64/all-provider/production claims outside scope.
- Verify trusted archive/manifest/receipt digests before extraction/use; independently compare every extracted candidate file's relative path, kind, size and SHA-256.
- Never rebuild, regenerate projections/manifests, run `npm ci`, patch code, normalize line endings or download native binaries on Windows. Dependencies/tests/fixtures must already be carried in the frozen candidate.
- Match scenarios N02–N07, N10–N15, D06, W01–W03 in the [acceptance matrix](acceptance-matrix.md). Actual macOS execution/tests remain prohibited.

## Architecture
- **Transfer verifier** and **host/runbook inventory** are disjoint preparation units; **automated runner** executes rows serially or in isolated independent host jobs; **console operator** separately exercises attached-console rows. Parent owns receipt aggregation/invalidation. Workers never run gates during edits.
- No new authoring expected in this phase. Proposed helpers `tests/advisor-controller/qualification-bundle.cjs` and `tests/advisor-controller/native-windows-qualification.cjs` must have been authored and manifested in Phase 06.
- Automated helper CLI, proposed until implemented: `--bundle <verified-package-root> --powershell <absolute-shell> --evidence <empty-external-dir> --mode automated`. Console uses identical API with `--mode console`, omits shell noninteractive restrictions and awaits actual operator input.
- Helper copies the manifested complete controller closure to private `<HOME>/.evcrate/bin/`; runs Node with absolute script/argv array, `shell:false`, exact UTF-8 stdin/EOF, canonical project cwd. No project controller installation. Source tests are supplementary, clearly labeled source-fixture evidence.
- Temporary directories are ordinary real directories, with isolated HOME/USERPROFILE, project(s), TMP/TEMP/TMPDIR and routing policy; use spaces plus non-ASCII characters in at least one HOME/project and request. Reuse current Windows native root/SID safety checks, not guessed POSIX chmod semantics.
- Build a case-normalized environment once: remove case-insensitive duplicate PATH keys, set PATH via `path.delimiter`, clear recursion markers and inherited advisor HOME/state overrides. Include only fixture backend bin, selected Node and necessary Windows/PowerShell system paths. Never inherit credential/provider account directories or live routing policy.
- Evidence is external to immutable payload. Receipt includes candidate/archive/manifest digests, scenario IDs, OS/build/architecture, Node path/version/platform, PowerShell path/version, exact commands/cwd/time/exits/counts, raw protocol-byte digests, run/checkpoint/revisions, sanitized fake-provider launch/stdin receipts, native cleanup results and console classification.

## Related Code Files
- **Verify-only proposed in Phase 06:** `tests/advisor-controller/qualification-bundle.cjs`, `tests/advisor-controller/native-windows-qualification.cjs`.
- **Verify-only native suites:** `tests/advisor-controller/provider-launch-identity.test.cjs`, `tests/advisor-controller/retry-orchestration.test.cjs`, `tests/advisor-controller/supervision-console.test.cjs`, `tests/advisor-controller/verification-lifecycle.test.cjs`.
- **Verify-only adapted source suites:** `tests/advisor-controller/controller.test.cjs`, `tests/advisor-controller/state-cli.test.cjs`, `tests/advisor-controller/history-cli.test.cjs`, `tests/advisor-controller/history-controller-integration.test.cjs`.
- **Verify-only proposed Phase 03 behavior suite:** `tests/advisor-controller/node-launch.test.cjs`; **fixture inputs:** `tests/advisor-controller/fixtures/checkpoint.json`, `tests/advisor-controller/fixtures/fake-codex.cjs`, `tests/advisor-controller/fixtures/fake-omp.cjs`.
- **Verify-only shared runtime:** `.evcrate/source/.evcrate/bin/evcrate-advisor`, `.evcrate/source/.evcrate/bin/lib/advisor/windows-platform.cjs`, `.evcrate/source/.evcrate/bin/lib/advisor/state-human.cjs`, `.evcrate/source/.evcrate/bin/lib/advisor/darwin-platform.cjs` (last is Phase 04/05 output).
- **Verify-only other authority:** `src/cli/health.ts`, `src/cli/process-runner.ts`, `tests/cli/health.test.mjs`, `tests/adapters/phase08-mentoring-integration.test.mjs`, `tests/installers/windows-release-qualification.mjs`, `package.json`, `.github/workflows/release.yml`, `.github/workflows/windows-smoke.yml`.
- **Generated external evidence only:** transferred archive/manifest/receipt, per-row automated and console logs/receipts. No modifications to the transferred source, fixtures, dist or projections.

## Implementation Steps
1. Provision native Windows x64 with both exact Node versions, Windows PowerShell 5.1 and PowerShell 7, plus a real attached console for the separate positive gate. Missing host/version/console is a future prerequisite block; still write truthful automated receipts for reachable rows. Do not launch existing release publication workflows.
2. Obtain Phase 06 `candidate.zip`, `manifest.json`, `receipt.json` and trusted expected digests independently from the producer. Set `$Archive`, `$Manifest`, `$Receipt`, `$ExtractRoot` to absolute private paths; expected values come from authenticated handoff, not downloaded sidecars alone. Verify before extraction (future PowerShell example):
   ```powershell
   if ((Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedArchiveSha256) { throw 'Archive mismatch' }
   if ((Get-FileHash -LiteralPath $Manifest -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedManifestSha256) { throw 'Manifest mismatch' }
   if ((Get-FileHash -LiteralPath $Receipt -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedReceiptSha256) { throw 'Receipt mismatch' }
   if (Test-Path -LiteralPath $ExtractRoot) { throw 'Extraction root must be new' }
   Expand-Archive -LiteralPath $Archive -DestinationPath $ExtractRoot
   $Bundle = Join-Path $ExtractRoot 'package'
   ```
   Existing verified ZIP format/archive bounds are Phase 06 authority; do not write a generic extractor. Reject failed hash, unexpected archive layout or extraction errors.
3. Select the exact absolute `$Node` and `$Shell` for one matrix row. Capture host/shell and Node identity:
   ```powershell
   $PSVersionTable
   & $Node -p 'JSON.stringify({platform:process.platform,arch:process.arch,node:process.version,execPath:process.execPath})'
   # Proposed Phase 06 helpers; not current commands until authored.
   & $Node "$Bundle\tests\advisor-controller\qualification-bundle.cjs" verify-archive --archive $Archive --manifest $Manifest
   if ($LASTEXITCODE -ne 0) { throw 'Archive inventory mismatch' }
   & $Node "$Bundle\tests\advisor-controller\qualification-bundle.cjs" verify --root $Bundle --manifest $Manifest
   if ($LASTEXITCODE -ne 0) { throw 'Candidate file mismatch' }
   ```
   Check receipt/source/native provenance relationship too. The verifier rejects extra/missing/case-colliding files and symlinks/reparse ancestors using existing policy. POSIX modes are archival metadata, not an NTFS permission assertion.
4. Run the preauthored automated helper from the verified package root under selected shell `-NoProfile -NonInteractive`; set `$Evidence` outside payload and change cwd to `$Bundle`. Exact proposed invocation:
   ```powershell
   & $Node '.\tests\advisor-controller\native-windows-qualification.cjs' --bundle $Bundle --powershell $Shell --evidence $Evidence --mode automated
   if ($LASTEXITCODE -ne 0) { throw 'Native advisor qualification failed' }
   ```
   The Node helper invokes/identifies the requested PowerShell, not merely whatever parent shell happens to be current, and independently verifies win32/exact Node. It launches no paid backend and records each subcommand's nonzero status as failure.
5. Helper runs these existing explicit test commands, each under the selected Node executable (shown as `node`; do not silently select another PATH runtime):
   ```powershell
   node --test tests/advisor-controller/provider-launch-identity.test.cjs tests/advisor-controller/retry-orchestration.test.cjs
   node --test tests/advisor-controller/supervision-console.test.cjs tests/advisor-controller/verification-lifecycle.test.cjs
   node --test tests/advisor-controller/controller.test.cjs tests/advisor-controller/state-cli.test.cjs tests/advisor-controller/history-cli.test.cjs tests/advisor-controller/history-controller-integration.test.cjs
   # Proposed behavior test from Phase 03:
   node --test tests/advisor-controller/node-launch.test.cjs
   ```
   Fail if required Win32 cases skip or portable fixture prerequisites are absent. Record intentionally POSIX-specific skips separately. Do not interpret generic test-runner exit 0 with skipped native tests as required coverage.
6. Independently exercise installed real CLI lifecycle: actual `state init` → `state checkpoint` → inference `[]` → `state get` → `state disposition` → **executed validation** and truthful no-change `state outcome` → `state complete`. Use current versioned JSON fixtures, generated run/operation IDs and returned revisions; assert terminal ADVICE_READY, matching checkpoint/correlation, completed gate, no invented changes/corrections, one expected fixture-provider final call and recorded audit linkage. Validation receipt cannot merely claim the existing `node --version` fixture check passed without executing it.
7. Use two private projects to demonstrate distinct state/history identity (N03). Exercise real `history list`, `show`, `metrics`, export dry-run/apply and prune dry-run/apply (N11), with eligible records and an active/pending protected record. Assert dry-run makes no output/deletions, export refuses existing destination, prune deletes only eligible owned records, scope is correct and history/outcome links match. Reuse existing protocol constructors, not guessed operation payloads.
8. Test programmatic Node pipes with Unicode request bytes, strict framing/envelope/exit checks and settled process close. Preserve protocol fields/digests where digest-bound; capture original input SHA-256 and actual fixture task/evidence content. Script paths/operation args stay argv; JSON never appears in argv or `node -e` strings.
9. Separately test the canonical PowerShell-owned `$jsonPayload | & node "$controller" ...` transport on both shells. Encode BOM-free UTF-8, retain/restore `$OutputEncoding` and applicable console encoding in `finally` on success **and failure**; do not treat Node-only pipes as shell encoding proof. Include Unicode state and consultation payloads, actual parsed fields and fixture-received input identity. Record any shell-added final newline explicitly while verifying the original JSON's UTF-8 content/digest; never repair payloads to hide corruption.
10. Exercise N05–N07/N12 negatives: unlaunchable selected Node while a direct-executable sentinel exists; missing/unreadable installed script with project-local/PATH traps; empty/invalid explicit HOME and HOME absent per existing Windows authority; malformed/oversize stdin, bad response/framing, nonzero process exit and cancellation. Assert no sentinel execution, fallback, cross-HOME mutation, fabricated controller envelope or satisfied advice gate. Transport failure may legitimately have no JSON result.
11. Observe actual Windows Job supervision/native process identity, CAS conflicts, launcher/script/package tampering, output flood, timeout and AbortSignal cleanup from the native suites. Record confirmed absence versus unknown-cleanup error; do not replace them with mock echo processes, POSIX `ps`, or global process kills. Linux/Windows smoke must not load/compile/download the packaged Darwin addon (D06).
12. Automated headless human-decision cases must return HUMAN_EVENT_REQUIRED with unchanged revision; JSON/chat approval cannot authorize state. Cancellation stays CANCELLED. These are negative receipts only; never synthesize keystrokes or positive console authorization in headless CI.
13. Run `--mode console` separately for each matrix row in an actual attached native console, without `-NonInteractive`. Helper creates isolated real state via current CLI operations and supplies human-decision request JSON while inheriting console stderr/handles. Operator manually enters the exact displayed fresh `authorize <run> <revision> <nonce>` challenge; wrong/stale challenge rejects without mutation, correct current challenge accepts the intended transition, cancellation aborts. Capture actual run/revision/event linkage and console receipt, no credential/full environment dump. No synthetic stdin challenge injection, direct state-file editing or mocked observer.
14. Repeat steps 3–13 for all four rows with new HOME/project/temp/evidence directories, same archive/manifest. Reverify payload afterward; fixtures may write only outside it. Aggregate scenario counts, per-row skips/blocks, cleanup and separate automated/console conclusions; installer/version-only checks, if separately authorized/run with their own assets, remain supplementary and cannot satisfy advisor gates.
15. Any transfer/test/console-required failure invalidates qualification completion. Preserve failure logs; do not patch candidate locally. For a code/fixture repair return to source integration and Phase 06, assign a new candidate/manifest/archive, rerun Linux gates and all Windows rows that consume it; this plan requires matching four-row evidence for the final candidate. Mark old receipts superseded, not retrospectively passed.

## Todo List
- [ ] Native x64 host, exact Node/shell rows and actual console available.
- [ ] Trusted transfer and every-file inventory checked before any advisor use.
- [ ] Four automated rows cover installed lifecycle, UTF-8, failure/no-fallback, history and native cleanup.
- [ ] Separate authentic human-console rows recorded; headless negatives never counted positive.
- [ ] Matching final-candidate receipts and external cleanup/evidence reviewed by parent.

## Success Criteria
- W01/W02 observed on actual win32: all four exact matrix rows and required scenario IDs complete, with meaningful native test counts and no unreported omissions.
- Real HOME-installed controller, state/history lifecycle and both transport families work; missing Node/script/HOME fail without alternative launch/search.
- Actual human console and automated rejection are distinct evidence; missing console remains blocked. No macOS test/runtime claim.
- No candidate regeneration, extra dependencies, symlink privilege, production policy/state or paid provider call; same content hashes before/after.
- Parent accepts scoped Windows result: candidate/version/architecture/shell/scenarios only, not general vendor/desktop/production parity.

## Risk Assessment
- Hosted runner lacks interactive console: use separately provisioned native console for required positive rows; report blockage instead of weakening human authorization.
- PowerShell 5.1 encoding and inherited duplicate PATH keys can corrupt input/select wrong Node: exact bytes, absolute executable and controlled environment.
- Legacy fake fixtures require symlinks/chmod or pollute source: readiness is a Phase 06 prerequisite, never a Windows hotfix.
- Cleanup uncertainty or mutable transfer breaks evidence: fail closed, retain receipts, issue/requalify a new candidate when repaired.

## Security Considerations
- Use authenticated digest handoff; SHA-256 proves byte identity, not absent signatures or producer authenticity.
- Keep private fixture state/exports and destructive prune within owned sandbox; targeted cleanup only after process settlement/ownership checks.
- Existing native console/SID/Job checks remain intact; no privilege escalation, global termination, execution-policy bypass or JSON-approval fallback.

## Next Steps
- Supply reviewed same-candidate four-row automated/console receipts to Phase 08; retain explicit provider/macOS/production limits.
- Failure requiring changed bytes returns through Phase 06 Linux qualification; no release, live HOME publication or commit follows automatically.

## Unresolved Questions
- Which native host and authentic interactive console will supply every required row? This is an execution prerequisite, not a planning blocker.
- Exact PowerShell 7 patch/OS build and trusted transfer location are determined and recorded at execution; no additional product-scope question remains.
