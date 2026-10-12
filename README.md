# EVCrate

EVCrate 3.0.0 is a private Node/TypeScript package (Node `>=22.19.0`) authoring
one canonical agent-harness source tree and building verified projections for
seven targets: `antigravity`, `claude`, `codex`, `copilot`, `omp`, `pi`, and `vscode`.
It publishes managed harness output with ownership, hashing, locking, and recovery rules.

## Download and installation

EVCrate provides registry-free unpack installers for Linux and Windows.

### Prerequisites

- Node.js `>=22.19.0` on `$PATH` (both installers; CI qualifies on Node `24.21.0`).
- Linux x86_64, or Windows x64 with PowerShell 7+ (`pwsh.exe`).

Download matching assets for the exact release tag (e.g. `v3.0.0`) from [GitHub Releases](https://github.com/EigenCrate/evcrate/releases) and keep each platform's files together locally. EVCrate is private (`npmPublish: false`); installers unpack offline local assets without querying npm.

### Exact local-asset installation

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

Keep `install.sh`, tarball, `.sha256` sidecar, and metadata together. `./install.sh install` selects local assets; then run `evcrate version --json` (add `$HOME/.local/bin` to PATH if needed).
Defaults: launcher `~/.local/bin/evcrate`, data `~/.local/share/evcrate/` (`$XDG_DATA_HOME/evcrate`), state `~/.local/state/evcrate/` (`$XDG_STATE_HOME/evcrate`).
Lifecycle: `./install.sh repair`, `./install.sh rollback <snapshot>`, `./install.sh uninstall`.
Installer rollback/uninstall touches only installer-owned paths; publication is managed by `evcrate publish`/`recover`.

### Windows (x64)

Keep `install.ps1`, ZIP, `.sha256` sidecar, and metadata together. Run `.\install.ps1 install` in PowerShell. The installer updates User PATH (`EnvironmentVariableTarget.User`); restart terminal, then run `evcrate version --json`.
Default locations: root/data `%LOCALAPPDATA%\EVCrate`, launcher `%LOCALAPPDATA%\EVCrate\bin\evcrate.cmd`, state `%LOCALAPPDATA%\EVCrate\state`, versions `%LOCALAPPDATA%\EVCrate\versions\<snapshot>`, current pointer `%LOCALAPPDATA%\EVCrate\current.json`.
Lifecycle: `.\install.ps1 repair`, `.\install.ps1 rollback <snapshot>`, `.\install.ps1 uninstall`.
Options accept PowerShell/GNU syntax: `-RootDir`/`--root-dir`, `-DataDir`/`--data-dir`, `-StateDir`/`--state-dir`, `-BinDir`/`--bin-dir`, `-Archive`/`--archive`, `-Checksum`/`--checksum`, `-Metadata`/`--metadata`. Asset overrides require Archive/Checksum/Metadata together.

**Bounded Windows support.** Qualification boundary is hosted `windows-2025` x64 (PowerShell 7 `pwsh.exe` and Node `24.21.0` in PR smoke `.github/workflows/windows-smoke.yml`, without release-time Windows candidate-byte qualification) for standalone installer smoke and clean-install `version --json`. General Windows runtime parity, desktop/UAC, SmartScreen, Authenticode, enterprise policy, ARM64, and execution-policy workarounds are not claimed. Production HOME publication remains operator-gated.

## Developer quick start

From a source checkout:

```bash
npm install
npm run build
npm run distribute:build
npm run distribute:check
node dist/cli/evcrate.js version --json
```

`build` compiles TypeScript control plane. Distribution build/check generates and verifies local projections. The compiled CLI is `dist/cli/evcrate.js`; installed packages expose the single `evcrate` binary.

### CLI reference

```text
evcrate distribute build|check|publish|all|recover
evcrate publish --dry-run|--apply
evcrate version
evcrate resources list|get
evcrate imports preview|apply
evcrate scopes list|get|assign|remove|enable|disable
evcrate changes preview|apply
```

### Release test gate

Before release, run `npm test`, `npm run release:check`, and `npm run distribute:check`. These repository gates do not replace live vendor qualification.

## Publication and recovery

Harness publication and recovery (`evcrate publish` and `evcrate recover`) are Linux runtime commands. Publication defaults to HOME scope; project scope is explicit:

```bash
evcrate publish --dry-run --json
evcrate publish --apply --json
evcrate publish --apply --scope home --home ~/.local-test --json
evcrate publish --apply --scope project --project-root /path/to/project --json
evcrate recover --scope home --json
evcrate recover --scope project --project-root /path/to/project --json
```

The CLI positional forms are plural: `evcrate resources list`, `evcrate imports preview`, `evcrate scopes list`, and `evcrate changes preview`. `--target` selects harness projections within the requested scope.
Current targets: `claude`, `codex`, `antigravity`, `pi`, `omp`, `copilot`, `vscode`. Standalone Gemini is retired; Antigravity uses vendor HOME `~/.gemini/config`. Canonical instructions are authored only in `.evcrate/source/.claude/AGENTS.md`; generated delivery formats are in the [instruction matrix](docs/system-architecture.md#instruction-authority-and-native-delivery).

HOME and project publication each run one scoped harness transaction. Project publication does not acquire HOME locks. Failure returns `PUBLICATION_FAILED` (exit 5), or `ROLLBACK_FAILED` (exit 5) if restoration failed. Failed transaction evidence is retained for recovery.
Publication state is scope-isolated: HOME at `$HOME/.evcrate/publication/`, Project at `stateRoot/project-publication/<canonical SHA-256 identity>`. Before recovery, stop agent processes and ensure roots are owner-controlled, non-symlink paths. Installer rollback and publication recovery are not interchangeable.

## Development and modification workflow

1. Edit canonical sources:
   - Instructions: `.evcrate/source/.claude/AGENTS.md`
   - Agents: `.evcrate/source/.claude/agents/`
   - Commands: `.evcrate/source/.claude/commands/`
   - Skills: `.evcrate/source/.claude/skills/`
   - Workflows: `.evcrate/source/.claude/workflows/`
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

Generated projections, manifests, and registry are never hand-edited. TypeScript and `package.json` scripts are authoritative.

## Unified Naming, Canonical AGENTS.md, and Migration Contract

Starting in version 3.0.0, EVCrate enforces universal `evc-*` resource naming and single `AGENTS.md` instruction authority across all supported targets:

### Naming invariants
- **Canonical Commands**: All 69 canonical commands use `evc-cmd-*` (e.g. `/evc-cmd-code`, `/evc-cmd-plan`). VS Code Local projects container-local `cmd-*` skills under plugin `evc`; other targets retain `evc-cmd-*`.
- **Nested Commands**: Subcommands use reserved separator `-x-` (e.g. `/evc-cmd-code-x-auto`, `/evc-cmd-fix-x-hard`), mapping reversibly to semantic IDs (`code/auto`, `fix/hard`).
- **Universal Agents**: All 17 canonical custom agents use prefix `evc-*` (e.g. `evc-planner`, `evc-code-reviewer`, `evc-debugger`).
- **Copilot Skills & Styles**: Copilot ordinary skills are renamed to `evc-<skill>` and styles to `evc-style-<style>`.
- **Specification**: Charset `^[a-z0-9]+(-[a-z0-9]+)*$`, maximum length 64 characters, no underscores, colons, or double hyphens.
- **VS Code Plugin**: `plugin.json` declares `"name": "evc"` (formerly `evcrate-local`). Copilot Chat displays `evc cmd-*`, with qualified invocation `/evc:cmd-*` (`/<plugin-name>:<skill-name>`).

### Canonical instruction authority and delivery
Author canonical target instructions only in `.evcrate/source/.claude/AGENTS.md`; `.evcrate/source/AGENTS.md` is generated Codex output. Claude publishes `.claude/rules/AGENTS.md` with no duplicate/shim. The [seven-target instruction matrix](docs/system-architecture.md#instruction-authority-and-native-delivery) specifies project/HOME paths and mixed-install loader profiles.

### Pre-upgrade customization backup warning
> **CRITICAL WARNING**: Deletion of obsolete artifacts during upgrade is strictly controlled by **recorded ownership**, not file modification timestamps. If you locally edited any managed legacy file, **those files will be deleted upon upgrading**. You **MUST** back up your local customizations before running `publish --apply` or upgrading via installers.

Untracked user files are never deleted and are reported during publication. Any unmanaged collision at a migrated destination halts publication atomically (`PUBLICATION_FAILED`). See [Pre-Upgrade Backup & Leftover Guidance](./docs/upgrade-backup-and-leftover-guidance.md).

## VS Code Local native support

EVCrate provides native support for VS Code Local as an isolated Agent Plugins 1.0 bundle (`evc`), distinct from GitHub Copilot CLI (`copilot`).

### Separation and command identity
- **Copilot CLI (`copilot`)**: Publishes Markdown prompt and skill files to `.copilot/` for the standalone CLI.
- **VS Code Local (`vscode`)**: Publishes an Agent Plugins 1.0 bundle to `.evcrate-vscode/`, including `plugin.json`, `hooks.json`, projected agents, commands (mapped as manual skills), skills, styles, and runtime hook closures.
- Canonical `evc-cmd-*` becomes manual skills at `.evcrate-vscode/skills/cmd-*/SKILL.md` (e.g. `evc-cmd-code-x-auto` → `cmd-code-x-auto`). Invocation is `/evc:cmd-*`. Generated references use local `/cmd-*` and `$cmd-*` forms via `replaceCommandInvocations`.
- Historical Linux x64 VS Code 1.140.0/Copilot Chat 0.68.0 qualification receipts describe original candidates, not current qualification.

### Publishing and activation
Publish with `evcrate publish --apply --scope project --project-root /path/to/project --target vscode` or `--scope home --target vscode`. Preview with `--dry-run --json`.
Interactive first use prompts: `Register this plugin in VS Code settings? [y/N]`. Confirmation updates only `chat.pluginLocations` in `.vscode/settings.json` or User settings. Non-interactive/CI requires `--register-vscode-settings`. Deactivate via `"chat.pluginLocations": { "...": false }`.

Publish with `evcrate publish --apply --scope project --project-root /path/to/project --target vscode`
or `--scope home --target vscode`. Preview with `--dry-run --json`.

On interactive first use, the CLI prompts to register `chat.pluginLocations` in settings and (after successful publication) optionally install the private companion extension (`eigencrate.evcrate-model-bindings`); both prompts default to No (`[y/N]`).
Pipes/CI/`--json` do not prompt and require explicit flags:
- Settings: `--register-vscode-settings` / `--no-register-vscode-settings` (manual: `"chat.pluginLocations": { "/path/to/.evcrate-vscode": true }`).
- Companion: `--install-vscode-companion` / `--no-install-vscode-companion` (`--vscode-editor <path>`, `--vscode-profile <name>`).
Dry-run never writes settings or installs extensions. Requested companion install failure returns exit 5 while keeping publication committed on stdout (status on stderr). Skills, commands, and hooks activate on plugin registration; companion agent contribution requires launching VS Code with `--enable-proposed-api=eigencrate.evcrate-model-bindings`.

The companion contributes an `EVCrate` Activity Bar icon and `Model Bindings` sidebar tree (`evcrate.modelBindingsView`), with `Installation Root`, `Model Tiers`, and `Agents (17)` sections. Selecting a tier or agent row opens configuration for that item.

### Policy, coexistence, and recovery
- **Single Active Copy**: Do not enable both HOME (`~/.evcrate-vscode`) and project (`.evcrate-vscode`) registrations in the same workspace. Project `.copilot` and `.evcrate-vscode` coexist independently.
- **Native Hooks**: CommonJS runtime closure inspects 8 lifecycle events (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `SubagentStart`, `SubagentStop`, `Stop`). Heavy directories are denied; sensitive files require interactive approval. Opt-in MCP examples are inert templates.
- **Recovery**: Recover project scope with `evcrate recover --scope project --project-root /path/to/project --json` (or `--scope home`).

## Documentation map

- [Agent guidance](./AGENTS.md) — shared agent workflows and subagent completion contract.
- [System architecture](./docs/system-architecture.md) — distribution, wire, context, and publication contracts.
- [Project overview and PDR](./docs/project-overview-pdr.md) — requirements, acceptance criteria, and release gates.
- [Code standards](./docs/code-standards.md) — implementation and review rules.
- [Codebase summary](./docs/codebase-summary.md) — source/module map from Repomix.
- [Project roadmap](./docs/project-roadmap.md) — phases, gates, and gaps.
- [Project changelog](./docs/project-changelog.md) — phase evidence and boundaries.
- [Project changelog archive](./docs/project-changelog-archive.md) — older phase detail.
- [Pi-native migration](./docs/pi-native-migration.md) — Pi runtime and settings notes.
- [Snyk specialist guide](./docs/snyk-expert-cli.md) — standalone common .agents bundle.
- [Upgrade & leftover guidance](./docs/upgrade-backup-and-leftover-guidance.md) — pre-upgrade backup and collision rules.
