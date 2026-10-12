# Common Snyk expert bundle

## Architecture and scope

`ext/snyk-expert/.agents/` is the target-neutral runtime payload. The Node installer copies its explicit inventory into the target project's `.agents/`; it creates no target-specific configuration or automatic discovery adapter. A host must support common skills or explicitly read the entrypoints and references. `.agents/agents/snyk-expert.md` is a portable specialist instruction document, not a promise of native subagent registration.

One specialist owns scope and finding decisions. Three task skills separate CLI setup/authentication/scanning (`snyk-cli`), dependency remediation (`snyk-fix`), and read-only compatibility assessment (`dependency-upgrade-review`). Maven/Spring and Node.js/TypeScript have concrete dependency procedures. Snyk Code source findings remain a distinct analysis lane, never converted into dependency upgrades.

The package bundle maintains exclusively `.agents/` resources. EVCrate canonical/generated resources and unresolved historical workflows remain untouched. Current documentation lives here, in `ext/snyk-expert/README.md`, and in `ext/snyk-expert/docs/usage.md`.

Installation is not scanner installation, authentication, scan permission, publication, or dependency-edit approval. The parent owns exact target scope, credentials, network/data transmission, allowed paths, execution boundary and human gates. No credentials are supplied by this package. Live authenticated Snyk and host qualification require separately authorized inputs.

## Installation and operation

Current packaged guide: [usage](../ext/snyk-expert/docs/usage.md). From this checkout:

```bash
node ext/snyk-expert/bin/install.js --target /path/to/project --dry-run
node ext/snyk-expert/bin/install.js --target /path/to/project
```

Explicitly load the installed specialist and selected skill references in the executing host. Use `snyk-cli` for operator-authorized setup/login and SCA/Code acquisition; `snyk-fix` for dependency analysis/remediation; `dependency-upgrade-review` for read-only exact-candidate assessments. HTML is optional evidence, not required to start CLI acquisition.

The installer needs trusted exclusive destination ownership. Collision/symlink defenses apply during preflight, not as an adversarial race-proof filesystem boundary. The package README and `docs/usage.md` document the current `.agents` contract.


## Proposed bounded remediation cycles — planning only

A general remediation cycle extension is planned in [plans/261012-1944-general-snyk-remediation-cycles/plan.md](../plans/261012-1944-general-snyk-remediation-cycles/plan.md) to add a command-style skill (`.agents/skills/cmd-snyk-remediate/SKILL.md`) to `ext/snyk-expert/`. The current installed inventory remains limited to the three task skills above; runtime implementation and live operational qualification are pending.

Key contract boundaries established in Phase 01:
- **Responsibility split:** The main session owns the positive integer attempt budget $N$, durable attempt history, human approval gates, private target-contained evidence storage, and live authenticated Snyk scans (initial scan Step 1 and terminal reconciliation Step 6). The existing specialist owns proposal selection, procedure binding, read-only compatibility review, and local verification (Step 5), returning `local verification complete; Snyk verification pending` without declaring findings fixed.
- **Attempt budget $N$:** Bounded positive integer $N$. The started attempt count increments exactly once immediately before the first operation capable of changing dependency inputs or resolution state in a coherent authorized attempt; subsequent commands within that set remain in that attempt. Failing native updates count against $N$. No refunds or count resets for failures, authorized inverse rollbacks, pauses, or process restarts.
- **Human approval gate:** Main collects explicit approval before mutating dependencies for major, breaking, uncertain, license-policy, runtime, or scope changes. Rejection, revision requests, or unclear intent do not consume an attempt.
- **Ecosystem procedure contract:** Concrete Maven/Spring and Node.js/TypeScript reference procedures are retained. Other package managers follow the standard workflow without hardcoded allowlists or extra human gates, provided a complete 6-point pre-edit procedure (executable, coupled owner set, literal commands, graph/consumer checks, scanner product/coverage, baseline tuple/recovery) is bound alongside official Snyk and manager support.
- **Private target-contained evidence:** Raw scanner outputs and append-only run ledgers default to an operator-bound private ignored directory inside the target repository satisfying containment, access control, untracked/ignored Git state, content safety (no credentials, copied manifests, or executable scripts), and non-input/non-coverage isolation. Unsafe storage pauses execution.
- **Observed procedures & learning:** Observed command traces are recorded inertly in verification ledgers. Skill improvement proposals are separate human-approved source maintenance tasks; no automatic `.agents` skill mutation or self-promotion.
- **Execution mode:** In environments lacking native portable agent registration, the executing host explicitly reads installed `.agents` resources from the canonical installed bundle root, reporting inline mode honestly without claims of native registration or sandboxing.

Phase 01 planning contracts and acceptance cases are recorded in the [design contracts](../plans/261012-1944-general-snyk-remediation-cycles/design-contracts.md), [acceptance matrix](../plans/261012-1944-general-snyk-remediation-cycles/acceptance-matrix.md) (SNYK-001–036), and [qualification prerequisites report](../plans/261012-1944-general-snyk-remediation-cycles/reports/qualification-prerequisites.md).
## Change record — 2026-10-09

- Common `.agents` distribution. Package README and docs describe exclusively the `.agents` layout, CLI workflow, and Node.js/TypeScript support.
- Added `snyk-cli` setup/auth/scan procedure, separate SCA/Code transmission and result lanes, original JSON/SARIF plus optional version-supported HTML, exact exits and workspace coverage.
- Added concrete npm/Yarn/pnpm Node.js/TypeScript ownership, manifest/lockfile/workspace updates, peer/engine/module/declaration compatibility and local compiler/runtime/rescan verification.
- Verified 26/26 package tests, 7 Node syntax checks, installer/pack/extract/install smoke, and constructed prompt scenarios.
- Evidence: [implementation plan](../plans/261009-1535-snyk-cli-node-typescript/plan.md) and [validation](../plans/261009-1535-snyk-cli-node-typescript/reports/validation.md). No authenticated Snyk scan, real target upgrade/fix, native discovery/permission parity or publication claim.

## Planning record — 2026-10-12 (Phase 01 — Contracts and prerequisites)

- Defined Phase 01 contracts and qualification prerequisites for proposed bounded general Snyk remediation cycles (`cmd-snyk-remediate`).
- Verified extension scope boundaries: authoring targets only `ext/snyk-expert/`; canonical EVCrate harness projections remain untouched.
- Mapped 36 acceptance cases across delivery, specification, and operational evidence classes (SNYK-001–036).
- Inventoried live operational qualification prerequisites (PREREQ-01–08) across isolated targets, pinned CLI, authentication, network, and storage.
- Evidence: [Phase 01 plan](../plans/261012-1944-general-snyk-remediation-cycles/phase-01-contracts-and-prerequisites.md), [design contracts](../plans/261012-1944-general-snyk-remediation-cycles/design-contracts.md), [acceptance matrix](../plans/261012-1944-general-snyk-remediation-cycles/acceptance-matrix.md), [prerequisites report](../plans/261012-1944-general-snyk-remediation-cycles/reports/qualification-prerequisites.md).
- Status: Planning only; runtime implementation (Phases 02–06) and live operational qualification (Phase 07) remain pending (Phase 07 requires operator-provided live prerequisites).
