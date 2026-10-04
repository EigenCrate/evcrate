# EVCrate

EVCrate 2.6.0 is a private Node/TypeScript package that authors one canonical
agent-harness source tree and builds verified projections for eight targets:
`antigravity`, `claude`, `codex`, `copilot`, `gemini`, `omp`, `pi`, and `vscode`.
It publishes managed output with ownership, hashing, locking, and recovery rules,
and ships one shared checkpoint advisor controller. The former DamHopper plugin
runtime/package and paired host integration were retired 2026-10-02; current
native integration does not use this package's former worker or bridge.

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
2. Regenerate and verify all eight target trees:
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

## VS Code Local native support

EVCrate provides native support for VS Code Local as an isolated Agent Plugins 1.0 bundle (`evcrate-local`), distinct from the GitHub Copilot CLI target (`copilot`).

### Separation from Copilot CLI

- **Copilot CLI (`copilot`)**: Publishes Markdown prompt and skill files to `.copilot/` for the standalone CLI.
- **VS Code Local (`vscode`)**: Publishes a complete Agent Plugins 1.0 bundle to `.evcrate-vscode/`, including `plugin.json`, `hooks.json`, 19 custom agents, 70 commands (mapped as manual skills), 40 skills, 6 styles, and runtime hook closures.

### Qualified runtime prerequisites

Live native qualification was verified on:
- **VS Code**: `1.140.0` (commit `07f806f999227108933c2e30515b26eecc1fda74`)
- **Copilot Chat Extension**: `0.68.0`
- **Host Platform**: Linux x86_64 (`linux-x64`)
- **Evidence**: [Qualification Index](plans/261002-2213-vscode-local-native-support/reports/native-local/qualification-index.md) (reconciling C01–C50 across 12 contexts)

### Publishing and activation

Publishing creates or updates the target projection without modifying editor settings:

```bash
# Preview publication in project scope
evcrate publish --dry-run --scope project --project-root /path/to/project --target vscode --json

# Apply publication to project scope
evcrate publish --apply --scope project --project-root /path/to/project --target vscode --json

# Apply publication to user HOME scope
evcrate publish --apply --scope home --target vscode --json
```

**User-controlled activation**: EVCrate never writes to your VS Code configuration. To activate the published plugin in VS Code, manually register its absolute path in your user or workspace `settings.json`:

```json
{
  "chat.pluginLocations": {
    "/path/to/project/.evcrate-vscode": true
  }
}
```

### Coexistence and one-copy policy

- **Single Active Copy**: Do not enable both HOME (`~/.evcrate-vscode`) and project-level (`.evcrate-vscode`) plugin registrations in the same workspace to prevent duplicate command and hook registrations.
- **Copilot CLI Coexistence**: Project `.copilot` and `.evcrate-vscode` trees operate independently without collision.

### Privacy, policy, and advisor boundaries

- **Native Hooks & Policy**: The CommonJS runtime closure inspects 8 lifecycle events (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `SubagentStart`, `SubagentStop`, `Stop`). Heavy build directories (`node_modules/`, `dist/`, `.git/`) are denied by scout policy; sensitive files (`.env`, credentials) require explicit interactive human approval.
- **Opt-in MCP**: Example configurations in `evcrate/examples/vscode-settings.example.json` are inert templates with pinned versions; no MCP servers are enabled by default.
- **Advisor Mentoring**: VS Code Local uses direct HOME advisor caller instructions pointing to `$HOME/.evcrate/bin/evcrate-advisor`. Standalone `--agent` relay is rejected with `ADVISE_AGENT_RELAY_UNSUPPORTED_VSCODE`.

### Recovery and removal

```bash
# Recover project scope after an interrupted transaction (preserves user settings)
evcrate recover --scope project --project-root /path/to/project --json

# Recover HOME scope
evcrate recover --scope home --json
```

To deactivate, set `"chat.pluginLocations": { "...": false }` or remove the key in your VS Code settings. File removal deletes only receipt-owned managed files.

## Documentation map

- [System architecture](./docs/system-architecture.md) — distribution, advisor, wire, and publication contracts.
- [Project overview and PDR](./docs/project-overview-pdr.md) — requirements, acceptance criteria, and release gates.
- [Code standards](./docs/code-standards.md) — implementation and review rules.
- [Codebase summary](./docs/codebase-summary.md) — source/module map from Repomix.
- [Project roadmap](./docs/project-roadmap.md) — phases, gates, and gaps.
- [Project changelog](./docs/project-changelog.md) — phase evidence and boundaries.
- [Project changelog archive](./docs/project-changelog-archive.md) — older phase detail.
- [Pi-native migration](./docs/pi-native-migration.md) — Pi runtime and settings notes.
- [Advisor integration history](./docs/system-architecture.md#9-historical-damhopper-advisor-plugin-integration-retired-2026-10-02) — former plugin architecture and qualification, retained as historical evidence.
