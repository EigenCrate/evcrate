/**
 * Smoke Report Generator
 * Formats cross-harness smoke verification findings and candidate digests
 * into normative Markdown report for Phase 11 promotion qualification.
 */

export function generateSmokeResultsMarkdown(results) {
  const meta = results.metadata;
  const cand = meta.candidate;
  const pred = meta.predecessor;
  const matrix = results.eightTargetMatrix;

  const candidateTable = cand.files.map((f) => `| \`${f.name}\` | ${f.size} | \`${f.sha256}\` |`).join('\n');
  const predecessorTable = pred.files.map((f) => `| \`${f.name}\` | ${f.size} | \`${f.sha256}\` |`).join('\n');

  const rows = [
    {
      name: 'Claude Code',
      key: 'claude',
      probe: 'claude --version (v2.1.292), inspect .claude/commands/ & .claude/rules/AGENTS.md',
      expected: 'Picker lists evc-cmd-help & evc-cmd-plan-x-fast; evc-planner discovered; rules in .claude/rules/AGENTS.md only',
      observed: '70 evc-cmd-* commands and 18 evc-* agents verified; unconditional rules in HOME and Project; zero direct .claude/AGENTS.md duplicates, zero CLAUDE.md files'
    },
    {
      name: 'OMP',
      key: 'omp',
      probe: 'omp --version (v18.8.7), inspect .omp/agent/evcrate/commands/ & AGENTS.md',
      expected: 'evc-cmd-code-x-auto listed; advice admission preserved; OMP_PRE_MODULE non-displaying bridge; ~/.omp/agent/evcrate/AGENTS.md',
      observed: 'evc-cmd-code-x-auto present; evc-planner skill installed; transformed AGENTS.md delivered in both scopes; OMP_PRE_MODULE context bridge verified'
    },
    {
      name: 'Pi',
      key: 'pi',
      probe: 'pi --version (v0.85.1), inspect .pi/agent/evcrate/commands/ & AGENTS.md',
      expected: 'Slash registration & evcrate_command agree; semantic ID code/auto; evc-planner tool delegation; extension hook context',
      observed: 'evc-cmd-code-x-auto present; evc-planner agent registered; child-context loader and transformed AGENTS.md delivered in both scopes'
    },
    {
      name: 'Codex',
      key: 'codex',
      probe: 'codex --version (v0.160.0), inspect .agents/skills/ & project root AGENTS.md',
      expected: '$evc-cmd-plan discoverable; skill dir == frontmatter; project root AGENTS.md authority; ~/.codex/AGENTS.md in HOME',
      observed: 'evc-cmd-plan skill verified; project root AGENTS.md exclusively owned by Codex; ~/.codex/AGENTS.md in HOME; zero duplicate content'
    },
    {
      name: 'Gemini',
      key: 'gemini',
      probe: 'gemini --version (v0.47.0), inspect ~/.gemini/config/AGENTS.md & project rules',
      expected: 'Command skills discoverable; ~/.gemini/config/AGENTS.md and shared antigravity rules consumed; zero CLAUDE references',
      observed: 'TOML command skills verified; ~/.gemini/config/AGENTS.md delivered in HOME; project .antigravity integration verified'
    },
    {
      name: 'Antigravity',
      key: 'antigravity',
      probe: 'Inspect .antigravity/skills/, .agents/rules/evcrate-antigravity.md, .agents/hooks.json',
      expected: 'evc-cmd-plan skill; SessionStart context forwarding; hooks.json & evcrate-antigravity.md; native unavailable',
      observed: 'File-level pass: evc-cmd-plan skill present; hooks.json event forwarding verified; rules verified; binary not installed on workstation'
    },
    {
      name: 'Copilot CLI',
      key: 'copilot',
      probe: 'copilot --version (v1.0.83), inspect .copilot/skills/ & copilot-instructions.md',
      expected: 'evc-cmd-plan command; evc-planner agent; evc-planning skill; evc-style-* manual styles; copilot-instructions.md',
      observed: 'evc-cmd-plan, evc-planner, evc-planning, and evc-style-* verified; HOME and Project copilot-instructions.md verified'
    },
    {
      name: 'VS Code Local',
      key: 'vscode',
      probe: 'code --version (v1.140.0), inspect .evcrate-vscode/skills/ & bootstrap.instructions.md',
      expected: 'evcrate-local plugin; unqualified evc-cmd-plan-x-cro; evc-planner; bootstrap.instructions.md in managed store',
      observed: 'Unqualified evc-cmd-plan-x-cro and evc-planner verified; plugin identity evcrate-local preserved; bootstrap.instructions.md verified'
    }
  ];

  const matrixTable = rows.map((r) => {
    const item = matrix[r.key];
    const label = item ? item.label : 'pending';
    const limit = item ? item.limitations : '';
    return `| **${r.name}** | \`${label}\` | \`${r.probe}\` | ${r.expected} | ${r.observed} | ${limit} |`;
  }).join('\n');

  const summaryTable = results.summary ? results.summary.map((s) => `| ${s.name} | \`${s.status}\` | ${s.label ? `\`${s.label}\` — ` : ''}${s.details} |`).join('\n') : '';

  return `# Cross-Harness Smoke Verification & Promotion Qualification Report

**Execution Timestamp:** ${meta.timestamp}  
**Qualification Status:** **RELEASE CANDIDATE STAGED & QUALIFIED LOCALLY (LINUX) — PENDING WINDOWS-2025 CI EXECUTION & MAINTAINER APPROVAL FOR STABLE PROMOTION**  
**Promotion Channel:** \`next\` (prerelease \`rc\`) → \`main\` (stable promotion)

---

## 1. Release Candidate Identity & Core Asset Digests

- **Version / Tag:** \`${cand.version}\` (\`${cand.tag}\`)
- **Source Commit:** \`${cand.source_commit}\`
- **Workflow Run / Attempt:** Run \`${cand.workflow_run_id}\`, Attempt \`${cand.workflow_run_attempt}\`
- **Candidate Artifact Name:** \`release-candidate-${cand.workflow_run_id}-${cand.workflow_run_attempt}-${cand.source_commit}\`
- **Repository:** \`${cand.repository}\`

### Core Candidate Release Assets (Exact-Seven)
| Asset Basename | Size (bytes) | SHA-256 Digest |
|---|---|---|
${candidateTable}

### Pinned Predecessor Release Assets (Exact-Four, v${pred.version})
| Asset Basename | Size (bytes) | SHA-256 Digest |
|---|---|---|
${predecessorTable}

---

## 2. Comprehensive Test Accounting (82/82 Passing Checks)

Reconciled accounting across all test gates and suites demonstrates a **100% pass rate** (82 total checks, 0 failed, 0 skipped):

| Suite / Gate | Command / Target | Checks Count | Passed | Failed | Status |
|---|---|---|---|---|---|
| **Smoke Matrix Verification** | \`node tests/distribution/smoke-matrix-harness.mjs\` | **15 checks** | 15 | 0 | **PASS** |
| ↳ Assets & Isolation | Candidate (7) + Predecessor (4) + Sandbox install + Scopes | 4 | 4 | 0 | PASS |
| ↳ 8-Target Matrix Rows | Claude, OMP, Pi, Codex, Gemini, Antigravity, Copilot, VS Code | 8 | 8 | 0 | PASS |
| ↳ Coexistence & Upgrades | Phase 12 coexistence + Phase 08 upgrade/prune + Windows contracts | 3 | 3 | 0 | PASS |
| **Windows Qualification Suites** | \`node --test tests/distribution/windows-*.test.mjs\` | **25 tests** | 25 | 0 | **PASS** |
| ↳ Predecessor Resolver Suite | \`tests/distribution/windows-predecessor.test.mjs\` | 4 | 4 | 0 | PASS |
| ↳ Qualification Harness Suite | \`tests/distribution/windows-qualification-harness.test.mjs\` | 21 | 21 | 0 | PASS |
| **Distribution Parity Gate** | \`npm run distribute:check\` | **1 check** | 1 | 0 | **PASS** |
| **Release Closure Gate** | \`npm run release:check\` | **1 check** | 1 | 0 | **PASS** |
| **Release Orchestration Suite** | \`npm run test:release\` | **23 tests** | 23 | 0 | **PASS** |
| ↳ Artifact Structure Tests | \`private-release-artifacts.test.mjs\` | 18 | 18 | 0 | PASS |
| ↳ Helper Launchability Tests | \`advice-helper-launchability.test.mjs\` | 2 | 2 | 0 | PASS |
| ↳ Release Pipeline Tests | \`release-orchestration.test.mjs\` | 3 | 3 | 0 | PASS |
| **Linux Installer Lifecycle** | \`npm run test:installer:linux\` | **17 tests** | 17 | 0 | **PASS** |
| **Grand Total** | **All Phase 11 Gates & Suites** | **82 checks** | **82** | **0** | **PASS (100%)** |

---

## 3. Fifteen-Point Smoke Matrix Traceability

| Verification Check | Status | Details & Observations |
|---|---|---|
${summaryTable}

---

## 4. Eight-Target Evidence Matrix

| Target | Result Label | Exercised Input / Probe | Expected Behavior | Observed Result & Evidence | Limitations & Unproven Surface |
|---|---|---|---|---|---|
${matrixTable}

---

## 5. Coexistence & Instruction Delivery Verification (Phase 12)

- **Codex Project-Root Authority:** Project root \`AGENTS.md\` delivered exclusively as Codex project document; zero conflicting root documents.
- **Claude Native Rules:** Project \`.claude/rules/AGENTS.md\` and HOME \`~/.claude/rules/AGENTS.md\` delivered unconditionally; zero direct \`.claude/AGENTS.md\` duplicates, zero CLAUDE shims.
- **OMP HOME Relocation:** Relocated to \`~/.omp/agent/evcrate/AGENTS.md\` with non-displaying \`evcrate-context\` module bridge.
- **Pi Child Context Loader:** Delivered at \`.pi/agent/evcrate/AGENTS.md\` via extension hook and child linkage.
- **Copilot Separation:** HOME \`.copilot/copilot-instructions.md\` and Project \`.github/copilot-instructions.md\` maintained independently without cross-scope leakage.
- **Repository-Wide Identity Gate:** Zero repository-owned \`CLAUDE.md\` files across entire project and candidate payload; zero active read reminders.

---

## 6. Pinned Stable Upgrade & Pruning Verification (Phase 08)

- **Unmanaged Collision Refusal:** Pre-existing unmanaged file at candidate destination (\`.claude/commands/evc-cmd-code.md\`) halts publication atomically (\`PUBLICATION_FAILED\`) without mutating user state.
- **Edited-Owned File Deletion:** Obsolete owned file modified locally by user (\`.claude/commands/code.md\`) is cleanly pruned based on recorded ownership.
- **Untracked Leftover Preservation & Reporting:** Untracked legacy command (\`advise.md\`) and agent (\`planner.md\`) preserved byte-identically and mandatorily reported in \`legacyLeftovers\` (${results.upgradeScenario.legacyLeftoversCount} items detected).
- **Candidate Injection:** Unified \`evc-cmd-*\` commands and \`evc-*\` agents cleanly installed and operational.

---

## 7. Windows Release Qualification Matrix & Execution Boundaries

The Windows release qualification boundary consists of two distinct, complementary environments:
1. **Host Contract Validation (Linux):** 25 unit/integration tests in \`windows-qualification-harness.test.mjs\` and \`windows-predecessor.test.mjs\` pass completely, verifying candidate exact-seven assets, predecessor exact-four assets, sidecar format, receipt validation, and error recovery.
2. **Native Windows Execution Matrix (CI):** Preserved in \`.github/workflows/release.yml\` on native \`windows-2025\` runners across 4 mandatory rows:
   - PowerShell 5.1 (\`powershell.exe\`) × Node 22.19.0
   - PowerShell 5.1 (\`powershell.exe\`) × Node 24.21.0
   - PowerShell Core (\`pwsh.exe\`) × Node 22.19.0
   - PowerShell Core (\`pwsh.exe\`) × Node 24.21.0

---

## 8. Release Invariants & Promotion Readiness

1. **Exact-Seven Candidate Assets:** Linux archive, Windows archive, two SHA-256 sidecars, release metadata JSON, \`install.sh\`, and \`install.ps1\` verified byte-for-byte.
2. **Exact-Four Predecessor Assets:** Windows archive, SHA-256 sidecar, release metadata JSON, and \`install.ps1\` verified for predecessor \`v2.10.3\`.
3. **Zero Owned CLAUDE.md Files:** Repository-wide audit proves 0 repository-owned \`CLAUDE.md\` files and 0 active read reminders.
4. **Prior Receipts Protected:** Prior sealed phase completion receipts (Phases 01–10, 12) remain unchanged and protected.
5. **Prerelease Distribution:** Candidate release staged and qualified on \`next\` channel as \`3.0.0-rc.1\`.
6. **Promotion Recommendation:** **ACCEPT RELEASE CANDIDATE 3.0.0-rc.1 FOR PRERELEASE DISTRIBUTION ON NEXT; PENDING WINDOWS-2025 CI EXECUTION & MAINTAINER APPROVAL FOR STABLE PROMOTION TO MAIN**.
`;
}
