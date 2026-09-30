# EVCrate

EVCrate 2.5.0 is a private Node/TypeScript package that authors one canonical
agent-harness source tree and builds verified projections for seven targets:
`antigravity`, `claude`, `codex`, `copilot`, `gemini`, `omp`, and `pi`.
It publishes managed output with ownership, hashing, locking, and recovery rules,
and ships one shared checkpoint advisor controller.

## Download and installation

EVCrate provides registry-free unpack installers for Linux and Windows.

### Prerequisites

- Node.js `>=22.19.0` on `$PATH` (both installers).
- Linux x86_64, or Windows x64 with Windows PowerShell 5.1 or PowerShell 7+.

Download matching assets from [GitHub Releases](https://github.com/EigenCrate/evcrate/releases)
and keep each platform's files together.

### Linux (x86_64)

Assets:

- `install.sh`
- `evcrate-v<version>-linux-x64.tar.gz`
- `evcrate-v<version>-linux-x64.tar.gz.sha256`
- `evcrate-v<version>.release.json`

Install and verify:

```bash
chmod +x install.sh
./install.sh install
export PATH="$HOME/.local/bin:$PATH"  # if needed for this shell
evcrate version --json
evcrate health --json
```

Defaults are launcher `~/.local/bin/evcrate`, data
`~/.local/share/evcrate/` (or `$XDG_DATA_HOME/evcrate`), and state
`~/.local/state/evcrate/` (or `$XDG_STATE_HOME/evcrate`).

```bash
./install.sh repair
./install.sh rollback <snapshot>
./install.sh uninstall
```

Installer `rollback`/`uninstall` touch only installer-owned launcher, unpack
data, and state. Harness publication journals and output are managed separately
by `evcrate publish` and `evcrate recover`.

### Windows (x64)

Assets:

- `install.ps1`
- `evcrate-v<version>-windows-x64.zip`
- `evcrate-v<version>-windows-x64.zip.sha256`
- `evcrate-v<version>.release.json`

From PowerShell, run:

```powershell
.\install.ps1 install
```

The installer writes the bin directory to the **User** `PATH`
(`EnvironmentVariableTarget.User`). Open a new terminal, or restart the current
session, before invoking the launcher:

```powershell
evcrate version --json
```

Default locations:

- Root/data: `%LOCALAPPDATA%\EVCrate`
- Bin and launcher: `%LOCALAPPDATA%\EVCrate\bin` (`evcrate.cmd`)
- State: `%LOCALAPPDATA%\EVCrate\state`
- Versions: `%LOCALAPPDATA%\EVCrate\versions\<snapshot>`
- Current pointer: `%LOCALAPPDATA%\EVCrate\current.json`

Lifecycle:

```powershell
.\install.ps1 repair
.\install.ps1 rollback <snapshot>
.\install.ps1 uninstall
```

The installer accepts each option in PowerShell and GNU-style spelling
(`-Name` and `--name`), for example `-RootDir`/`--root-dir`:

- `-RootDir` / `--root-dir`
- `-DataDir` / `--data-dir`
- `-StateDir` / `--state-dir`
- `-BinDir` / `--bin-dir`
- `-Archive` / `--archive`
- `-Checksum` / `--checksum`
- `-Metadata` / `--metadata`

When overriding local assets, provide `Archive`, `Checksum`, and `Metadata`
together. `RootDir` selects the installation root; `DataDir` is an equivalent
root/data override when `RootDir` is not supplied.

**Bounded Windows support.** The hosted four-row `windows-2025` x64 matrix
qualifies only standalone installer lifecycle and clean-install `version --json`.
`publish`, `health`, and general Windows runtime parity remain outside release
support. Native Windows Advisor Phases 01–04 are complete: Phase 03 observed live
OMP `ADVICE_READY`; Phase 04 qualified OMP/Codex diagnostics, while Claude/Pi
remain unverified. The Linux qualification suite passed 400/400 on WSL Ubuntu
22.04/ext4. Desktop/UAC, SmartScreen, Authenticode, enterprise-policy, ARM64,
self-hosted-runner, and execution-policy-workaround behavior is not claimed.
Production HOME publication and release authorization remain operator-gated.
PR smoke is diagnostic; only the four-row release matrix authorizes publication.

## Developer quick start

From a source checkout:

```bash
npm install
npm run build
npm run distribute:build
npm run distribute:check
node dist/cli/evcrate.js version --json
```

`build` compiles the TypeScript control plane and regenerates controller
inventory. Distribution build/check generates and verifies local projections.
The compiled CLI is `dist/cli/evcrate.js`; installed packages expose `evcrate`.

### CLI reference

```text
evcrate distribute build|check|publish|all|recover
evcrate publish --dry-run|--apply
evcrate health
evcrate version
evcrate resources list|get
evcrate imports preview|apply
evcrate scopes list|get|assign|remove|enable|disable
evcrate changes preview|apply
```

### Release test gate

Before release, run `npm test`, `npm run release:check`, and
`npm run distribute:check`. These repository gates do not replace live vendor
qualification or release authorization.

## Publication and recovery

Harness publication and recovery commands (`evcrate publish` and `evcrate recover`) are Linux runtime commands. Publication defaults to HOME scope; project scope is explicit:

```bash
evcrate publish --dry-run --json
evcrate publish --apply --json
evcrate publish --apply --scope home --home ~/.local-test --json
evcrate publish --apply --scope project --project-root /path/to/project --json
evcrate recover --scope home --json
evcrate recover --scope project --project-root /path/to/project --json
```

The CLI positional forms are plural: `evcrate resources list`,
`evcrate imports preview`, `evcrate scopes list`, and `evcrate changes preview`.
`--target` filters harness projections only; the shared controller is always
published under `<home>/.evcrate/bin` and never under a project root.

HOME publication is one atomic transaction. Project publication commits the
shared HOME controller first, then the project harness under the project lock.
If the harness fails, only project work is rolled back; shared HOME work is not
compensated. A successful rollback returns status `partial` and
`PUBLICATION_FAILED` (exit 5); a failed rollback retains the journal and returns
`ROLLBACK_FAILED` (exit 5).

Publication state is scope-isolated:

- HOME: `$HOME/.evcrate/publication/`
- Project: `stateRoot/project-publication/<canonical SHA-256 identity>`

Before recovery, stop agent processes and ensure the relevant roots are
owner-controlled, non-symlink paths. Recover only the failed scope. Installer
rollback selects a prior package snapshot; publication recovery repairs an
interrupted harness transaction. They are not interchangeable.

## Development and modification workflow

1. Edit canonical sources:
   - Commands: `.evcrate/source/.claude/commands/`
   - Skills: `.evcrate/source/.claude/skills/`
   - Controller: `.evcrate/source/.evcrate/bin/`
2. Regenerate and verify all seven target trees:
   ```bash
   npm run distribute:build
   npm run distribute:check
   ```
3. Regenerate registry and build manifests:
   ```bash
   npm run generate:all
   ```
4. Review focused CLI/publication checks before pushing:
   ```bash
   npm run test:cli
   npm run test:publication
   ```
5. Commit canonical sources with generated manifests:
   ```bash
   git add .evcrate/source/ .evcrate/build-manifest*.json .evcrate/registry.json
   git commit -m "feat(commands): description of your change"
   ```

Generated projections, manifests, registry, and runtime brief artifacts are
never hand-edited. There is no canonical root `distribute.py`; the TypeScript
path and `package.json` scripts are authoritative.

## Advisor checkpoint

Configure the required user-owned policy at
`$HOME/.evcrate/advisor-routing.json`:

```json
{
  "version": 2,
  "advisor": {
    "primary": {"backend": "codex", "model": "operator-selected", "effort": "high"},
    "backup": {"backend": "omp", "model": "operator-selected", "effort": "high"}
  },
  "wait": {"mode": "until_terminal", "warn_after_ms": 120000, "warn_every_ms": 300000},
  "history": {"retention_days": 30, "max_bytes": 104857600}
}
```

Use distinct routes. Enabled backends are `claude`, `codex`, `pi`, and `omp`;
`antigravity` is unavailable, and Gemini/Copilot are not controller backends.
For existing policy, use `evcrate advisor settings get`, prepare a v2 request,
then `preview` and `apply`; migration never rewrites HOME automatically.

A final standalone `--advice` token activates formal
`evcrate-advisor-checkpoint/v2` mentoring for bootstrap, code, cook, and fix
reviews (up to three correction cycles). `@advisor` remains ordinary task text.
The documentation-facing `/cmd-advise` workflow is a separate interview path.

## DamHopper Advisor Plugin

Private, client-side, read-only React interface embedded as an independently installed, owner-safe DamHopper plugin (`evcrate.advisor`) for inspecting retained advisor consultations, aggregated execution metrics, routing configuration, and external counsel evaluations.

### Plugin packaging and verification

```bash
npm run build:all                  # Build control plane and plugin UI
npm run build:advisor-plugin       # Build deterministic plugin tarball
npm run verify:advisor-plugin dist/advisor-plugin/evcrate-advisor-plugin-v0.1.0.tar.gz
```

The E04/G3-qualified independent package is designed for direct DamHopper installation without a host rebuild. This package-level status does not establish joint G4 qualification/sign-off, authorize standalone retirement, or verify current release assets.

`plugin/manifest.json` remains package version `0.1.0` with `dataApi: ^1.0.0`;
the domain API is v2 with v1/v2 support and eight read-only methods.
GitHub attaches `evcrate-advisor-plugin-v0.1.0.tar.gz` and `evcrate-advisor-plugin-v0.1.0.tar.gz.sha256` separately from the seven core assets.

### Security, metrics, and limitations

- **Owner-safe isolation:** All reads are served by a bounded Node worker over framed transport, reauthorized per actor context. The embedded iframe has no host credentials, DOM access, or direct network capability.
- **Metrics kernel:** Delivery rate (accepted/terminal), outcome coverage (valid outcome/`ADVICE_READY`), known-outcome resolution (resolved/known outcomes), and receipt latency p95 (nearest-rank). Zero denominators render as `null` (`—`).
- **Four provider-neutral views:** Overview metrics, History & Detail drawers, Configuration (current account policy), and Evaluations (candidate comparisons).
- **Boundaries & non-claims:** Retained samples only (no complete audit coverage); no causal effectiveness, cost, or saved-time claims. The standalone picker source has been removed from this repository, but joint G4 qualification/sign-off is unverified and standalone retirement is not release-authorized.
## Documented command names

Documentation and target-facing examples use `/cmd-*` slash names:

```text
/cmd-plan "design the change"
/cmd-cook "implement the approved plan"
/cmd-code plans/example.md --advice
/cmd-fix__hard "apply a scoped fix"
```

OMP nested names use `__`; Copilot projects them as `/evcrate-cmd-fix-hard`.
`evcrate/command-name-map.json` is authoritative for target translations.
This is a documentation convention; scanner/parser prefix enforcement remains a
follow-up and does not rename canonical source files or invent aliases.

## Documentation map

- [System architecture](./docs/system-architecture.md) — distribution, advisor, wire, and publication contracts.
- [Project overview and PDR](./docs/project-overview-pdr.md) — requirements, acceptance criteria, and release gates.
- [Code standards](./docs/code-standards.md) — implementation and review rules.
- [Codebase summary](./docs/codebase-summary.md) — source/module map from Repomix.
- [Project roadmap](./docs/project-roadmap.md) — phases, gates, and gaps.
- [Project changelog](./docs/project-changelog.md) — phase evidence and boundaries.
- [Project changelog archive](./docs/project-changelog-archive.md) — older phase detail.
- [Pi-native migration](./docs/pi-native-migration.md) — Pi runtime and settings notes.
- [Advisor plugin UI](./docs/advisor-plugin-ui.md) — embedded four-view plugin UI and bridge architecture.
