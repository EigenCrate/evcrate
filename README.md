# EVCrate

EVCrate is a private Node/TypeScript package that authors one canonical
agent-harness source tree, builds verified projections for seven targets, and
publishes managed output with ownership, hashing, locking, and recovery rules.
It also ships one shared checkpoint advisor controller.

**Package:** `2.1.0`  
**Windows status:** Qualification is complete through Phase 10 (10/10 phases,
100%; completed 2026-09-15). One immutable release candidate was proven on
GitHub-hosted Windows Server 2025 (`windows-2025`) x64 across Windows PowerShell
5.1/PowerShell 7 and Node.js 22.19.0/24.21.0 for the standalone installer
lifecycle and `version --json`. Runtime/vendor qualification, production HOME
publication, npm publication, deployment, and rollout remain separate gates.

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

**Bounded Windows support.** Proven on hosted `windows-2025` x64 with Windows
PowerShell 5.1 and PowerShell 7, and Node.js 22.19.0 and 24.21.0, for
`install`, repeat-install, `repair`, upgrade, `rollback`, `uninstall`, and clean
installation verification with `evcrate version --json`. Runtime commands
(`publish`, `health`, and advisor execution) remain Linux-only. Desktop/UAC,
SmartScreen, Authenticode, enterprise-policy, ARM64, self-hosted-runner, and
execution-policy-workaround behavior is not claimed. PR smoke is diagnostic;
only the four-row release matrix authorizes publication.

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

- [System architecture](./docs/system-architecture.md) — central distribution,
  advisor, wire, isolation, and publication contracts.
- [Project overview and PDR](./docs/project-overview-pdr.md) — intent,
  requirements, acceptance criteria, and release gates.
- [Code standards](./docs/code-standards.md) — implementation and review rules.
- [Codebase summary](./docs/codebase-summary.md) — source/module map from Repomix.
- [Project roadmap](./docs/project-roadmap.md) — phases, gates, and gaps.
- [Project changelog](./docs/project-changelog.md) — phase evidence and boundaries.
- [Project changelog archive](./docs/project-changelog-archive.md) — older detail.
- [Pi-native migration](./docs/pi-native-migration.md) — Pi runtime/settings notes.

