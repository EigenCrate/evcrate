# Phase 07 Installed Host Smoke Report

## 1. Executive Summary & Verification Context

- **Date:** 2026-10-13
- **Phase:** Phase 07 — Behavioral evals and installed host smoke
- **Package:** `@evcrate/sonarqube-test-quality@1.0.0`
- **Host Runtime:** Linux x86_64 (`linux 7.1.10-200.fc44.x86_64`), Node.js `v24.16.0`
- **Scope:** Packed tarball generation, extraction into clean temporary workspaces outside the checkout, clean installation across `--target agents`, `--target claude`, and `--target both`, repeat no-op idempotency, collision guards, replacement confirmation, loaded path verification, and duplicate-root discovery observation.
- **Verification Boundary:** Verified actual binary installer behavior from unpacked `.tgz` artifact in clean disposable temporary workspaces outside the git checkout. Zero writes to `$HOME`, and zero native settings, registry, or plugin configurations written.

---

## 2. Packed Tarball Integrity & Manifest Inventory

A distribution tarball was generated via `npm pack --json` within `ext/sonarqube-test-quality/`:

- **Filename:** `evcrate-sonarqube-test-quality-1.0.0.tgz`
- **Package Size:** 86,347 bytes (compressed)
- **Unpacked Size:** 289,049 bytes
- **SHA-1 Shasum:** `fbc32c272aa4c21bdf196fd520c63cbfc6576d77`
- **SHA-512 Integrity:** `sha512-I1EPPAbxUPFtN+xBdhhpUe1v8GXUqFxPVYGuwp2kUoboZepTOzACebNFNJoDGfTD56oG9Tx0bHCfypz7d5sZ4Q==`
- **Entry Count:** 23 files (18 source assets + package.json, README.md, evals.json, lib/install.js, bin/install.js)

### Pack Contents Inventory
1. `README.md` (10,200 B)
2. `SKILL.md` (4,181 B)
3. `agents/sonar-evidence.md` (39,469 B)
4. `bin/install.js` (4,216 B, mode 0751)
5. `commands/cmd-sonar-remediate/SKILL.md` (19,317 B)
6. `evals/evals.json` (56,036 B)
7. `lib/install.js` (19,686 B)
8. `package.json` (606 B)
9. `references/full-scan-workflow.md` (5,282 B)
10. `references/local-analysis.md` (10,008 B)
11. `references/project-discovery.md` (8,620 B)
12. `references/remediation-and-handoff.md` (4,108 B)
13. `references/remediation-cycles.md` (31,361 B)
14. `references/report-formats.md` (4,589 B)
15. `references/run-guidance.md` (14,927 B)
16. `references/sonar-cli-commands.md` (5,243 B)
17. `references/testing-and-coverage.md` (4,532 B)
18. `references/worktree-remediation.md` (4,367 B)
19. `scripts/calculate-jacoco-coverage.ps1` (2,606 B)
20. `scripts/convert-sonar-report.mjs` (5,172 B)
21. `scripts/fetch-sonar-issues.ps1` (1,466 B)
22. `templates/remediation-cycle-report.md` (24,175 B)
23. `templates/run-guidance-report.md` (8,882 B)

All 23 entries match the package allowlist in `package.json`.

---

## 3. Isolated Installation Smoke from Extracted Package

The tarball was extracted via `tar -xzf evcrate-sonarqube-test-quality-1.0.0.tgz` in an isolated disposable directory (`/tmp/sonar-packed-smoke-*`) outside the repository working tree. All installation tests were executed by invoking the extracted entrypoint (`node package/bin/install.js`).

### 3.1 Single Root: `--target agents`
- **Command:** `node package/bin/install.js --target agents --directory ./ws-agents`
- **Exit Code:** 0
- **Results:**
  - Installed **18 files** into `./ws-agents/.agents/skills/`.
  - Established exactly two entrypoints:
    * `.agents/skills/sonarqube-test-quality/SKILL.md`
    * `.agents/skills/cmd-sonar-remediate/SKILL.md`
  - Unselected root verified untouched: `.claude` does NOT exist (`has .claude: false`).
  - No native settings written: `.vscode`, `settings.json`, and `plugin.json` absent.
  - No writes to `$HOME` or global paths (installer operations confined strictly to specified project directory).
- **Repeat Execution (Idempotency):**
  - Command: `node package/bin/install.js --target agents --directory ./ws-agents`
  - Exit Code: 0
  - Output: `Installed 0 file(s); 18 unchanged.` (`=` prefix for all 18 files).

### 3.2 Single Root: `--target claude`
- **Command:** `node package/bin/install.js --target claude --directory ./ws-claude`
- **Exit Code:** 0
- **Results:**
  - Installed **18 files** into `./ws-claude/.claude/skills/`.
  - Established exactly two entrypoints:
    * `.claude/skills/sonarqube-test-quality/SKILL.md`
    * `.claude/skills/cmd-sonar-remediate/SKILL.md`
  - Unselected root verified untouched: `.agents` does NOT exist (`has .agents: false`).
  - No native settings written: `.vscode`, `settings.json`, and `plugin.json` absent.
  - No writes to `$HOME` or global paths (installer operations confined strictly to specified project directory).
- **Repeat Execution (Idempotency):**
  - Command: `node package/bin/install.js --target claude --directory ./ws-claude`
  - Exit Code: 0
  - Output: `Installed 0 file(s); 18 unchanged.` (`=` prefix for all 18 files).

### 3.3 Dual Root: `--target both`
- **Command:** `node package/bin/install.js --target both --directory ./ws-both`
- **Exit Code:** 0
- **Results:**
  - Installed **36 files** across both roots (18 in `.agents`, 18 in `.claude`).
  - Two entrypoints per root:
    * `.agents/skills/sonarqube-test-quality/` + `.agents/skills/cmd-sonar-remediate/`
    * `.claude/skills/sonarqube-test-quality/` + `.claude/skills/cmd-sonar-remediate/`
  - Cross-root transactional lock verified; cross-root fault rollback is separately validated by unit suite `tests/install.test.mjs` (injected staging failure releases owned locks and restores original files).
  - No native settings written: `.vscode`, `settings.json`, and `plugin.json` absent.
- **Repeat Execution (Idempotency):**
  - Command: `node package/bin/install.js --target both --directory ./ws-both`
  - Exit Code: 0
  - Output: `Installed 0 file(s); 36 unchanged.` (`=` prefix for all 36 files).

---

## 4. Collision Guards, Protection, and Replacement

### 4.1 Missing Target Argument
- **Command:** `node package/bin/install.js --directory ./ws-fail`
- **Exit Code:** 1
- **Stderr:** `Error: Option --target is required. Choose agents, claude, or both.`
- **Result:** Fails closed without creating directories or writing files.

### 4.2 Colliding Destination File without `--force`
- **Setup:** Custom user `SKILL.md` (`custom-user-content`) placed at `.agents/skills/sonarqube-test-quality/SKILL.md`.
- **Command:** `node package/bin/install.js --target agents --directory ./ws-coll`
- **Exit Code:** 1
- **Stderr:** `Error: Destination files differ. Re-run with --force to authorize replacement.`
- **Preservation Check:** User content remained untouched (`custom-user-content`). Zero files were written or altered on disk.

### 4.3 Colliding File with `--force` but without `--yes`
- **Command:** `node package/bin/install.js --target agents --directory ./ws-coll --force`
- **Exit Code:** 1
- **Stderr:** `Error: Replacing files also requires confirmation with --yes.`
- **Result:** Fails closed requiring affirmative interactive or `--yes` confirmation. Zero files overwritten.

### 4.4 Colliding File with `--force --yes`
- **Command:** `node package/bin/install.js --target agents --directory ./ws-coll --force --yes`
- **Exit Code:** 0
- **Output:** Replaced colliding file (`! skills/sonarqube-test-quality/SKILL.md`) and cleanly installed remaining 17 files (`+`).

---

## 5. Layout Resolution Analysis and Duplicate Root Observation

*(Note: The following path tables and duplicate risk observations reflect expected layout analysis and test fixture validation. Live host runtime discovery and independent-child execution remain **BLOCKED / UNEXERCISED** pending a running host environment).*

### 5.1 Expected Loaded Path Resolution
For installed consuming workspaces, all file references resolve strictly relative to the installed skill root without referencing the original repository source tree:

| Role / Artifact | `.agents` Path | `.claude` Path |
|---|---|---|
| **Command Entrypoint** | `.agents/skills/cmd-sonar-remediate/SKILL.md` | `.claude/skills/cmd-sonar-remediate/SKILL.md` |
| **Domain Skill Entrypoint** | `.agents/skills/sonarqube-test-quality/SKILL.md` | `.claude/skills/sonarqube-test-quality/SKILL.md` |
| **Evidence Actor** | `.agents/skills/sonarqube-test-quality/agents/sonar-evidence.md` | `.claude/skills/sonarqube-test-quality/agents/sonar-evidence.md` |
| **Remediation Cycles Ref** | `.agents/skills/sonarqube-test-quality/references/remediation-cycles.md` | `.claude/skills/sonarqube-test-quality/references/remediation-cycles.md` |
| **Run Guidance Ref** | `.agents/skills/sonarqube-test-quality/references/run-guidance.md` | `.claude/skills/sonarqube-test-quality/references/run-guidance.md` |
| **Cycle Report Template** | `.agents/skills/sonarqube-test-quality/templates/remediation-cycle-report.md` | `.claude/skills/sonarqube-test-quality/templates/remediation-cycle-report.md` |
| **Run Guidance Template** | `.agents/skills/sonarqube-test-quality/templates/run-guidance-report.md` | `.claude/skills/sonarqube-test-quality/templates/run-guidance-report.md` |

### 5.2 Duplicate Root Observation & Risk Analysis (Both Roots Present)
In an unassisted directory scanner that scans both `.agents/skills` and `.claude/skills` simultaneously:
- **Discovered Skills:**
  - `cmd-sonar-remediate` (in `.agents/skills`)
  - `sonarqube-test-quality` (in `.agents/skills`)
  - `cmd-sonar-remediate` (in `.claude/skills`)
  - `sonarqube-test-quality` (in `.claude/skills`)
- **Duplicates Observed:** 2 copies of `cmd-sonar-remediate`, 2 copies of `sonarqube-test-quality`.

### 5.3 Isolation Policy & Qualification Boundary
- **Supported Explicit Selection:** Consuming host or CLI must select the active root explicitly (e.g. configuring the agent harness to look in `.agents/skills` OR `.claude/skills`, or specifying `--target agents` / `--target claude`).
- **Unassisted Multi-Root Discovery:** When an agent environment scans both directories concurrently without target disambiguation, the duplicate skills cause name ambiguity.
- **Contract Enforcement:** Per Phase 07 specification Step 10:
  * Automatic unassisted discovery in dual-root workspaces without explicit target selection is marked **ambiguous/unqualified**.
  * Single-root installation (`--target agents` or `--target claude`) is the qualified supported standard.
  * No files are deleted and no global settings are rewritten to force disambiguation.

---

## 6. Summary Receipt

- Packed Tarball Size: 86,347 B (23 files, shasum `fbc32c272aa4c21bdf196fd520c63cbfc6576d77`)
- Installation `--target agents`: 18 files, 0 native settings, repeat no-op clean.
- Installation `--target claude`: 18 files, 0 native settings, repeat no-op clean.
- Installation `--target both`: 36 files, 0 native settings, repeat no-op clean.
- Missing target: Fails closed.
- Collision: Blocked without `--force --yes`; replaced cleanly with `--force --yes`.
- Host Discovery: Same-root resolution verified in layout fixtures; duplicate root ambiguity documented.
- **Live Host Runtime Discovery & Independent Children: BLOCKED / UNEXERCISED** (requires running host harness environment).
- **Installed Binary Smoke from Packed Tarball: VERIFIED (Offline / Isolated Workspace).**
