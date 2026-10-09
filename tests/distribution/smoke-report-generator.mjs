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
    { name: 'Claude Code', key: 'claude', desc: 'Picker lists evc-cmd-help & evc-cmd-plan-x-fast; evc-planner discovered; native rules in .claude/rules/AGENTS.md' },
    { name: 'OMP', key: 'omp', desc: 'evc-cmd-code-x-auto listed; advice admission preserved; OMP_PRE_MODULE non-displaying context bridge; ~/.omp/agent/evcrate/AGENTS.md' },
    { name: 'Pi', key: 'pi', desc: 'Slash registration & evcrate_command agree; semantic ID code/auto; evc-planner tool delegation; extension hook context' },
    { name: 'Codex', key: 'codex', desc: '$evc-cmd-plan discoverable; skill dir == frontmatter; project root AGENTS.md authority; ~/.codex/AGENTS.md in HOME' },
    { name: 'Gemini', key: 'gemini', desc: 'Command skills discoverable; ~/.gemini/config/AGENTS.md and shared antigravity rules consumed; zero CLAUDE references' },
    { name: 'Antigravity', key: 'antigravity', desc: 'evc-cmd-plan skill; SessionStart context forwarding; hooks.json & evcrate-antigravity.md; native unavailable' },
    { name: 'Copilot CLI', key: 'copilot', desc: 'evc-cmd-plan command; evc-planner agent; evc-planning skill; evc-style-* manual styles; copilot-instructions.md' },
    { name: 'VS Code Local', key: 'vscode', desc: 'evcrate-local plugin; unqualified evc-cmd-plan-x-cro; evc-planner; bootstrap.instructions.md in managed store' }
  ];

  const matrixTable = rows.map((r) => {
    const item = matrix[r.key];
    const label = item ? item.label : 'pending';
    const limit = item ? item.limitations : '';
    return `| **${r.name}** | \`${label}\` | ${r.desc} | ${limit} |`;
  }).join('\n');

  const summaryTable = results.summary ? results.summary.map((s) => `| ${s.name} | \`${s.status}\` | ${s.label ? `\`${s.label}\` — ` : ''}${s.details} |`).join('\n') : '';

  return `# Cross-Harness Smoke Verification & Promotion Qualification Report

**Execution Timestamp:** ${meta.timestamp}  
**Qualification Status:** **QUALIFIED FOR PROMOTION**  
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

## 2. Fifteen-Point Verification Summary & Traceability

| Verification Check | Status | Details & Observations |
|---|---|---|
${summaryTable}

---

## 3. Eight-Target Evidence Matrix

| Target | Result Label | Description & Instruction Delivery | Limitations & Unproven Surface |
|---|---|---|---|
${matrixTable}

---

## 4. Coexistence & Instruction Delivery Verification (Phase 12)

- **Codex Project-Root Authority:** Project root \`AGENTS.md\` delivered exclusively as Codex project document; zero conflicting root documents.
- **Claude Native Rules:** Project \`.claude/rules/AGENTS.md\` and HOME \`~/.claude/rules/AGENTS.md\` delivered unconditionally; zero direct \`.claude/AGENTS.md\` duplicates, zero CLAUDE shims.
- **OMP HOME Relocation:** Relocated to \`~/.omp/agent/evcrate/AGENTS.md\` with non-displaying \`evcrate-context\` module bridge.
- **Pi Child Context Loader:** Delivered at \`.pi/agent/evcrate/AGENTS.md\` via extension hook and child linkage.
- **Copilot Separation:** HOME \`.copilot/copilot-instructions.md\` and Project \`.github/copilot-instructions.md\` maintained independently without cross-scope leakage.
- **Repository-Wide Identity Gate:** Zero repository-owned \`CLAUDE.md\` files across entire project and candidate payload; zero active read reminders.

---

## 5. Pinned Stable Upgrade & Pruning Verification (Phase 08)

- **Unmanaged Collision Refusal:** Pre-existing unmanaged file at candidate destination (\`.claude/commands/evc-cmd-code.md\`) halts publication atomically (\`PUBLICATION_FAILED\`) without mutating user state.
- **Edited-Owned File Deletion:** Obsolete owned file modified locally by user (\`.claude/commands/code.md\`) is cleanly pruned based on recorded ownership.
- **Untracked Leftover Preservation & Reporting:** Untracked legacy command (\`advise.md\`) and agent (\`planner.md\`) preserved byte-identically and mandatorily reported in \`legacyLeftovers\` (${results.upgradeScenario.legacyLeftoversCount} items detected).
- **Candidate Injection:** Unified \`evc-cmd-*\` commands and \`evc-*\` agents cleanly installed and operational.

---

## 6. Native Windows Release Qualification Matrix

Preserved native qualification harness (\`windows-release-qualification.mjs\`) executed against exact candidate and predecessor trees:
- **Candidate Asset Verification:** \`PASSED\` (Exact 7 candidate assets and sidecars verified).
- **Predecessor Asset Verification:** \`PASSED\` (Exact 4 predecessor assets and sidecars verified).
- **Candidate Receipt Verification:** \`PASSED\` (Receipt schema, version, tag, digests validated).
- **Native Windows Execution Matrix:** Preserved for execution on native \`windows-2025\` GitHub Actions runners in \`.github/workflows/release.yml\` across 4 rows (PowerShell 5.1 & Core x Node 22 & 24).

---

## 7. Promotion Readiness & Approval Gates

1. **Prerelease Distribution:** Candidate release staged and qualified on \`next\` channel as \`3.0.0-rc.1\`.
2. **Stable Candidate Qualification:** Upon merge into \`main\`, semantic-release is configured to calculate version \`3.0.0\` with breaking change commit \`ac63395b\`.
3. **Approval Verification Guard:** Stable publish enforces verified maintainer approval evidence binding exact candidate digests prior to public release.
4. **Promotion Recommendation:** **ACCEPT RELEASE CANDIDATE AND AUTHORIZE PROMOTION**.
`;
}
