# EVCrate

EVCrate 2.10.0 is a private Node/TypeScript package that authors one canonical
agent-harness source tree and builds verified projections for seven targets:
`antigravity`, `claude`, `codex`, `copilot`, `omp`, `pi`, and `vscode`.
It publishes managed output with ownership, hashing, locking, and recovery rules,
and ships one shared checkpoint advisor controller. The former DamHopper plugin
runtime/package and paired host integration were retired 2026-10-02; current
native integration does not use this package's former worker or bridge.

## Download and installation

EVCrate provides registry-free unpack installers for Linux and Windows.

### Prerequisites

- Node.js `>=22.19.0` on `$PATH` (both installers).
- Linux x86_64, or Windows x64 with Windows PowerShell 5.1 or PowerShell 7+.

Download matching assets for the exact release tag (e.g. `v3.0.0-rc.1` or `v3.0.0`) from [GitHub Releases](https://github.com/EigenCrate/evcrate/releases)
and keep each platform's files together in a local directory. EVCrate is a private package (`npmPublish: false`); installers unpack offline local assets and do not fetch remote `/releases/latest` or query the npm registry.

### Exact local-asset installation (prerelease & stable)

To install an exact downloaded release candidate or stable release using explicit local assets:

**Linux (x86_64):**
```bash
chmod +x install.sh
./install.sh install \
  --archive ./evcrate-v<version>-linux-x64.tar.gz \
  --checksum ./evcrate-v<version>-linux-x64.tar.gz.sha256 \
  --metadata ./evcrate-v<version>.release.json
```

**Windows (x64 PowerShell):**
```powershell
.\install.ps1 install `
  -Archive .\evcrate-v<version>-windows-x64.zip `
  -Checksum .\evcrate-v<version>-windows-x64.zip.sha256 `
  -Metadata .\evcrate-v<version>.release.json
```

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

Current targets: `claude`, `codex`, `antigravity`, `pi`, `omp`, `copilot`, `vscode`.
Standalone Gemini is retired; Antigravity still uses its vendor HOME
`~/.gemini/config`. Canonical instructions are authored only in
`.evcrate/source/.claude/AGENTS.md`; generated delivery formats and native
loader prerequisites are in the [instruction matrix](docs/system-architecture.md#instruction-authority-and-native-delivery).

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
   - Instructions: `.evcrate/source/.claude/AGENTS.md`
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
`antigravity` is unavailable, standalone Gemini is retired, and Copilot is not a controller backend.
For existing policy, use `evcrate advisor settings get`, prepare a v2 request,
then `preview` and `apply`; migration never rewrites HOME automatically.

A final standalone `--advice` token activates formal
`evcrate-advisor-checkpoint/v2` mentoring for bootstrap, code, cook, and fix
reviews (up to three correction cycles). `@advisor` remains ordinary task text.
The documentation-facing `/evc-cmd-advise` workflow is a separate interview path.
Direct controller invocation requires Node with valid absolute HOME and exact JSON
on stdin: `node "$HOME/.evcrate/bin/evcrate-advisor" state <operation>` (or empty
subcommand for checkpoint inference); see [canonical workflow](./.evcrate/source/.claude/workflows/advisor-mentoring.md)
for authoritative host-aware lifecycle syntax.

## Unified Naming, Canonical AGENTS.md, and Migration Contract

Starting in version 3.0.0, EVCrate enforces universal `evc-*` resource naming and single `AGENTS.md` instruction authority across all supported targets:

### Naming invariants
- **Universal Commands**: All commands project with prefix `evc-cmd-*` (e.g. `/evc-cmd-code`, `/evc-cmd-plan`).
- **Nested Commands**: Subcommands use the reserved separator `-x-` (e.g. `/evc-cmd-code-x-auto`, `/evc-cmd-fix-x-hard`). This separator maps reversibly to internal semantic identifiers (`code/auto`, `fix/hard`).
- **Universal Agents**: All 18 custom agents use prefix `evc-*` (e.g. `evc-planner`, `evc-reviewer`, `evc-debugger`).
- **Copilot Skills & Styles**: Copilot ordinary skills are renamed to `evc-<skill>` and styles to `evc-style-<style>`.
- **Specification**: Charset `^[a-z0-9]+(-[a-z0-9]+)*$`, maximum length 64 characters, no underscores, colons, or double hyphens.
- **Advisor Stability**: Internal advisor semantic IDs (21 allowlisted IDs, e.g. `code/auto`, `cook/auto`) remain unchanged invariants for fail-closed advisor activation.
- **VS Code Plugin**: The plugin ID `evcrate-local` is preserved; the `evcrate-local:` qualifier is VS Code's internal namespace disambiguation and is never emitted by EVCrate.

### Canonical instruction authority & delivery matrix
- **Single Canonical Source**: Canonical instructions are authored only in `.evcrate/source/.claude/AGENTS.md`. Root `.evcrate/source/AGENTS.md` remains distinct as a generated Codex projection.
- **Claude Native Rules**: Claude publishes unconditional `.claude/rules/AGENTS.md` in both HOME and project scopes; no `.claude/AGENTS.md` duplicate or legacy CLAUDE shim is emitted.
- **Target Delivery Matrix**:
  - `codex`: Project root `AGENTS.md` + native HOME `~/.codex/AGENTS.md`
  - `gemini`: Project root `GEMINI.md` + native HOME `~/.gemini/GEMINI.md`
  - `antigravity`: Native HOME `~/.gemini/config/AGENTS.md`
  - `omp`: Bridge payload `AGENTS.md`, native HOME `~/.omp/agent/AGENTS.md`
  - `pi`: Bridge payload `AGENTS.md` under `~/.pi/agent/evcrate/`
  - `copilot`: Project `.github/copilot-instructions.md`
  - `vscode`: Plugin `rules/bootstrap.instructions.md`
- **Coexistence Profiles**: In mixed setups, Gemini selects GEMINI-only context. Claude users may set `Project instructions = claude-md` in settings to prevent Claude from inadvertently loading Codex's root `AGENTS.md`. User configurations are preserved without automatic mutation.

### Pre-upgrade customization backup warning
> **CRITICAL WARNING**: Deletion of obsolete artifacts during upgrade is strictly controlled by **recorded ownership**, not file modification timestamps. If you locally edited any managed legacy file (e.g. legacy commands, agents, or instructions like `CLAUDE.md`), **those files will be deleted upon upgrading**. You **MUST** back up your local customizations before running `publish --apply` or upgrading via installers.

Untracked user files are never deleted and are mandatorily reported during publication. Any unmanaged collision at a migrated destination halts publication atomically (`PUBLICATION_FAILED`). See [Pre-Upgrade Backup & Leftover Guidance](./docs/upgrade-backup-and-leftover-guidance.md) for full details.

### Migration reference table

| Resource Kind | Former Shape (<= 2.x) | Unified Shape (3.x) |
|---|---|---|
| Root Command | `/code:auto`, `/cmd-code__auto`, `cmd_code_auto`, `evcrate-cmd-code-auto` | `/evc-cmd-code` |
| Nested Command | `/code:auto`, `/cmd-code__auto`, `cmd_code_auto` | `/evc-cmd-code-x-auto` |
| Deep Nested Command | `/cook:auto:fast`, `/cmd-cook__auto__fast` | `/evc-cmd-cook-x-auto-x-fast` |
| Help Command | `/help`, `/cmd-help` | `/evc-cmd-help` |
| Custom Agent | `planner`, `evcrate-planner`, `code-reviewer` | `evc-planner`, `evc-code-reviewer` |
| Copilot Ordinary Skill | `<skill>` | `evc-<skill>` |
| Copilot Style | `<style>` | `evc-style-<style>` |
| Instruction Authority | `CLAUDE.md`, `.claude/CLAUDE.md` | `AGENTS.md`, `.claude/rules/AGENTS.md` |
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

Publishing creates or updates the target projection with opt-in, non-destructive `settings.json` registration:

```bash
# Preview publication in project scope (inert; never writes settings)
evcrate publish --dry-run --scope project --project-root /path/to/project --target vscode --json

# Apply publication to project scope (prompts to register in .vscode/settings.json on interactive TTY if absent)
evcrate publish --apply --scope project --project-root /path/to/project --target vscode

# Explicit automated registration (registers without asking; suitable for scripts and CI)
evcrate publish --apply --scope project --project-root /path/to/project --target vscode --register-vscode-settings

# Skip settings registration explicitly
evcrate publish --apply --scope project --project-root /path/to/project --target vscode --no-register-vscode-settings

# Apply publication to user HOME scope (targets platform User settings.json)
evcrate publish --apply --scope home --target vscode
```

**Settings registration and activation**:
- **Interactive First-Time Prompt**: On an interactive terminal, if the published plugin directory is not already registered under `chat.pluginLocations`, the CLI prompts:
  `Register this plugin in VS Code settings? [y/N]`
  Confirming writes only `chat.pluginLocations: { "<path>": true }` to `.vscode/settings.json` (for `--scope project`) or User `settings.json` (for `--scope home`), preserving existing comments, formatting, and unrelated settings.
- **Automated / CI Environments**: In non-interactive environments (pipes, CI, `--json`), the CLI skips the prompt and does not register unless `--register-vscode-settings` is provided. Use `--no-register-vscode-settings` to disable detection and registration entirely.
- **Manual Registration**: You can also manually add the path to `chat.pluginLocations` in `.vscode/settings.json` (workspace) or user `settings.json`:

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
