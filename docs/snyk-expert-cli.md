# Common Snyk expert bundle

## Architecture and scope

`ext/snyk-expert/.agents/` is the target-neutral runtime payload. The Node installer copies its explicit inventory into the target project's `.agents/`; it creates no target-specific configuration or automatic discovery adapter. A host must support common skills or explicitly read the entrypoints and references. `.agents/agents/snyk-expert.md` is a portable specialist instruction document, not a promise of native subagent registration.

One specialist owns scope and finding decisions. Three task skills separate CLI setup/authentication/scanning (`snyk-cli`), dependency remediation (`snyk-fix`), and read-only compatibility assessment (`dependency-upgrade-review`). Maven/Spring and Node.js/TypeScript have concrete dependency procedures. Snyk Code source findings remain a distinct analysis lane, never converted into dependency upgrades.

Historical `.claude/` resources and `README.md` are sealed snapshots, retained unchanged and not used by the installer. EVCrate canonical/generated resources and unresolved historical workflows remain untouched. New documentation belongs here; old snapshot wording is not current runtime guidance.

Installation is not scanner installation, authentication, scan permission, publication, or dependency-edit approval. The parent owns exact target scope, credentials, network/data transmission, allowed paths, execution boundary and human gates. No credentials are supplied by this package. Live authenticated Snyk and host qualification require separately authorized inputs.

## Installation and operation

Current packaged guide: [usage](../ext/snyk-expert/docs/usage.md). From this checkout:

```bash
node ext/snyk-expert/bin/install.js --target /path/to/project --dry-run
node ext/snyk-expert/bin/install.js --target /path/to/project
```

Explicitly load the installed specialist and selected skill references in the executing host. Use `snyk-cli` for operator-authorized setup/login and SCA/Code acquisition; `snyk-fix` for dependency analysis/remediation; `dependency-upgrade-review` for read-only exact-candidate assessments. HTML is optional evidence, not required to start CLI acquisition.

The installer needs trusted exclusive destination ownership. Collision/symlink defenses apply during preflight, not as an adversarial race-proof filesystem boundary. npm automatically includes the sealed historical README; the installer prints the current packaged guide path. Resolve landing-document strategy before any separately authorized public release.

## Change record — 2026-10-09

- User-selected common `.agents` cutover, preserving all sealed `.claude` resources and old README. Installer names and project-local collision/confirmation behavior retained; no legacy runtime shim or host adapter.
- Added `snyk-cli` setup/auth/scan procedure, separate SCA/Code transmission and result lanes, original JSON/SARIF plus optional version-supported HTML, exact exits and workspace coverage.
- Added concrete npm/Yarn/pnpm Node.js/TypeScript ownership, manifest/lockfile/workspace updates, peer/engine/module/declaration compatibility and local compiler/runtime/rescan verification.
- Verified 24/24 package tests, seven Node syntax checks, actual installer/pack/extract/install smoke and seven constructed prompt scenarios. Independent scoped review 9/10, zero critical/high. User approved local delivery and separately authorized a scoped commit, no push.
- Evidence: [implementation plan](../plans/261009-1535-snyk-cli-node-typescript/plan.md) and [validation](../plans/261009-1535-snyk-cli-node-typescript/reports/validation.md). No authenticated Snyk scan, real target upgrade/fix, native discovery/permission parity or publication claim.
