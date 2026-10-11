# EVCrate

EVCrate 2.11.0 is a private Node/TypeScript package that authors one canonical
agent-harness source tree and builds verified projections for seven targets:
`antigravity`, `claude`, `codex`, `copilot`, `omp`, `pi`, and `vscode`.
It publishes managed harness output with ownership, hashing, locking, and recovery rules.

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

Keep `install.sh`, the Linux tarball, its `.sha256` sidecar, and release metadata together.
`./install.sh install` selects local assets; exact overrides are shown above.
Then run `evcrate version --json`; add `$HOME/.local/bin` to PATH if needed.

Defaults are launcher `~/.local/bin/evcrate`, data
`~/.local/share/evcrate/` (or `$XDG_DATA_HOME/evcrate`), and state
`~/.local/state/evcrate/` (or `$XDG_STATE_HOME/evcrate`).

Lifecycle: `./install.sh repair`, `./install.sh rollback <snapshot>`, `./install.sh uninstall`.

Installer `rollback`/`uninstall` touch only installer-owned launcher, unpack
data, and state. Harness publication journals and output are managed separately
by `evcrate publish` and `evcrate recover`.

### Windows (x64)

Keep `install.ps1`, the Windows ZIP, its `.sha256` sidecar, and release metadata together.
Run `.\install.ps1 install` in PowerShell (or exact asset overrides above).
The installer updates **User** PATH (`EnvironmentVariableTarget.User`).
Open a new terminal/restart the session, then run `evcrate version --json`.

Default locations:

- Root/data: `%LOCALAPPDATA%\EVCrate`
- Bin and launcher: `%LOCALAPPDATA%\EVCrate\bin` (`evcrate.cmd`)
- State: `%LOCALAPPDATA%\EVCrate\state`
- Versions: `%LOCALAPPDATA%\EVCrate\versions\<snapshot>`
- Current pointer: `%LOCALAPPDATA%\EVCrate\current.json`

Lifecycle: `.\install.ps1 repair`, `.\install.ps1 rollback <snapshot>`, `.\install.ps1 uninstall`.

Options accept PowerShell/GNU spelling: `-RootDir`/`--root-dir`,
`-DataDir`/`--data-dir`, `-StateDir`/`--state-dir`, `-BinDir`/`--bin-dir`,
`-Archive`/`--archive`, `-Checksum`/`--checksum`, `-Metadata`/`--metadata`.
Asset overrides require Archive/Checksum/Metadata together. RootDir selects the
installation root; DataDir is equivalent when RootDir is absent.

**Bounded Windows support.** The release qualification boundary is the hosted
four-row `windows-2025` x64 matrix for standalone installer lifecycle and
clean-install `version --json`. General Windows runtime parity, desktop/UAC,
SmartScreen, Authenticode, enterprise-policy, ARM64, self-hosted-runner, and
execution-policy-workaround behavior is not claimed. Current package/runtime
qualification must be exercised separately; historical results do not qualify
this cutover. Production HOME publication and release authorization remain
operator-gated. PR smoke is diagnostic, not publication authorization.

## Developer quick start

From a source checkout:

```bash
npm install
npm run build
npm run distribute:build
npm run distribute:check
node dist/cli/evcrate.js version --json
```

`build` compiles the TypeScript control plane. Distribution build/check generates
and verifies local projections. The compiled CLI is `dist/cli/evcrate.js`;
installed packages expose the single `evcrate` binary.

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
`--target` selects harness projections within the requested scope.

Current targets: `claude`, `codex`, `antigravity`, `pi`, `omp`, `copilot`, `vscode`.
Standalone Gemini is retired; Antigravity still uses its vendor HOME
`~/.gemini/config`. Canonical instructions are authored only in
`.evcrate/source/.claude/AGENTS.md`; generated delivery formats and native
loader prerequisites are in the [instruction matrix](docs/system-architecture.md#instruction-authority-and-native-delivery).

HOME and project publication each run one scoped harness transaction. Project
publication does not first commit HOME infrastructure or acquire HOME publication
locks. Failure returns the ordinary structured error result: `PUBLICATION_FAILED`
(exit 5), or `ROLLBACK_FAILED` (exit 5) if restoration failed. Failed transaction
evidence is retained for recovery; no successful restoration is claimed on rollback failure.

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

Generated projections, manifests, and registry are never hand-edited.
There is no canonical root `distribute.py`; TypeScript and `package.json` scripts
are authoritative.

## Inline interview

`/evc-cmd-advise` runs a multi-turn interview in the main session: one substantive
question per turn, at most eight discovery questions, then a concise reframe for
explicit confirmation or correction (at most two confirmation cycles). Cancellation,
interruption, or nonconvergence produces no report. Arguments remain ordinary task data.

After confirmation, the main session writes a sanitized report of at most 32 KiB
under repository-relative `plans/reports/`, or an explicitly active plan's `reports/`.
It inspects paths and ancestors, uses a fresh no-clobber filename
`advise-YYYYMMDD-HHMM-<uuid>.md`, and reads the report back before linking it.
If the host cannot safely inspect/create the report, it stops writing and states
that limitation. Generated prompts are not proof of native interview compliance.

## Unified Naming, Canonical AGENTS.md, and Migration Contract

Starting in version 3.0.0, EVCrate enforces universal `evc-*` resource naming and single `AGENTS.md` instruction authority across all supported targets:

### Naming invariants
- **Canonical Commands**: Commands use `evc-cmd-*` (e.g. `/evc-cmd-code`, `/evc-cmd-plan`). VS Code Local projects container-local `cmd-*` skills under plugin `evc`; other targets retain `evc-cmd-*`.
- **Nested Commands**: Subcommands use the reserved separator `-x-` (e.g. `/evc-cmd-code-x-auto`, `/evc-cmd-fix-x-hard`). This separator maps reversibly to internal semantic identifiers (`code/auto`, `fix/hard`).
- **Universal Agents**: All 17 canonical custom agents use prefix `evc-*` (e.g. `evc-planner`, `evc-code-reviewer`, `evc-debugger`).
- **Copilot Skills & Styles**: Copilot ordinary skills are renamed to `evc-<skill>` and styles to `evc-style-<style>`.
- **Specification**: Charset `^[a-z0-9]+(-[a-z0-9]+)*$`, maximum length 64 characters, no underscores, colons, or double hyphens.
- **VS Code Plugin**: `plugin.json` declares `"name": "evc"` (formerly `evcrate-local`). Copilot Chat displays `evc cmd-*`, with qualified invocation `/evc:cmd-*` (`/<plugin-name>:<skill-name>`); skill names omit the extra `evc-` prefix.

### Canonical instruction authority and delivery
Author only `.evcrate/source/.claude/AGENTS.md`; generated root AGENTS is Codex output.
Claude publishes `.claude/rules/AGENTS.md` with no duplicate/shim. The
[seven-target instruction matrix](docs/system-architecture.md#instruction-authority-and-native-delivery)
specifies project/HOME paths and mixed-install loader profiles (including Claude `claude-md`).

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
| VS Code Command Skill | `evcrate-local` plugin / `evc-cmd-*` skill | `evc` plugin / `cmd-*` skill; qualified `/evc:cmd-*` |
| Instruction Authority | `CLAUDE.md`, `.claude/CLAUDE.md` | `AGENTS.md`, `.claude/rules/AGENTS.md` |
## VS Code Local native support

EVCrate provides native support for VS Code Local as an isolated Agent Plugins 1.0 bundle (`evc`), distinct from the GitHub Copilot CLI target (`copilot`).

### Separation from Copilot CLI

- **Copilot CLI (`copilot`)**: Publishes Markdown prompt and skill files to `.copilot/` for the standalone CLI.
- **VS Code Local (`vscode`)**: Publishes an Agent Plugins 1.0 bundle to `.evcrate-vscode/`, including `plugin.json`, `hooks.json`, projected agents, commands (mapped as manual skills), skills, styles, and runtime hook closures. Inventories derive from canonical sources, not historical bundle counts.

### Command identity and invocation

Canonical `evc-cmd-*` commands become manual skills at `.evcrate-vscode/skills/cmd-*/SKILL.md`. For example, `evc-cmd-code-x-auto` becomes `cmd-code-x-auto`: Copilot Chat displays `evc cmd-code-x-auto` and qualifies it as `/evc:cmd-code-x-auto`. The plugin supplies the `evc` namespace; do not duplicate it in skill names.

Generated prompt references use local `/cmd-*` and `$cmd-*` forms. `replaceCommandInvocations` in `src/adapters/vscode/references.ts` rewrites canonical `/evc-cmd-*` and `$evc-cmd-*` references, including wildcard families such as `/evc-cmd-plan-x-*` → `/cmd-plan-x-*`. The shared `ev-help.py` scanner discovers both `evc-cmd-*/SKILL.md` and `cmd-*/SKILL.md`. Canonical sources, other targets, and semantic command IDs remain unchanged.

### Native qualification boundary
Historical Linux x64 VS Code 1.140.0/Copilot Chat 0.68.0
[receipts](plans/261002-2213-vscode-local-native-support/reports/native-local/qualification-index.md)
describe their original candidates, not current package/interview qualification.

### Publishing and activation

Publish with `evcrate publish --apply --scope project --project-root /path/to/project --target vscode`
or `--scope home --target vscode`. Preview with `--dry-run --json`.

On interactive first use, the CLI asks `Register this plugin in VS Code settings? [y/N]`.
Confirmation updates only `chat.pluginLocations` in project `.vscode/settings.json`
or platform User settings, preserving comments, formatting, and unrelated settings.
Pipes/CI/`--json` do not prompt/register unless `--register-vscode-settings` is supplied;
`--no-register-vscode-settings` disables detection/registration. Dry-run never writes settings.
Manual registration uses `"chat.pluginLocations": { "/path/to/project/.evcrate-vscode": true }`.

### Coexistence and one-copy policy

- **Single Active Copy**: Do not enable both HOME (`~/.evcrate-vscode`) and project-level (`.evcrate-vscode`) plugin registrations in the same workspace to prevent duplicate command and hook registrations.
- **Copilot CLI Coexistence**: Project `.copilot` and `.evcrate-vscode` trees operate independently without collision.

### Privacy and policy boundaries

- **Native Hooks & Policy**: The CommonJS runtime closure inspects 8 lifecycle events (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `SubagentStart`, `SubagentStop`, `Stop`). Heavy build directories (`node_modules/`, `dist/`, `.git/`) are denied by scout policy; sensitive files (`.env`, credentials) require explicit interactive human approval.
- **Opt-in MCP**: Example configurations in `evcrate/examples/vscode-settings.example.json` are inert templates with pinned versions; no MCP servers are enabled by default.

### Recovery and removal

```bash
# Recover project scope after an interrupted transaction (preserves user settings)
evcrate recover --scope project --project-root /path/to/project --json

# Recover HOME scope
evcrate recover --scope home --json
```

To deactivate, set `"chat.pluginLocations": { "...": false }` or remove the key in your VS Code settings. File removal deletes only receipt-owned managed files.

## Documentation map

- [System architecture](./docs/system-architecture.md) — distribution, wire, context, and publication contracts.
- [Project overview and PDR](./docs/project-overview-pdr.md) — requirements, acceptance criteria, and release gates.
- [Code standards](./docs/code-standards.md) — implementation and review rules.
- [Codebase summary](./docs/codebase-summary.md) — source/module map from Repomix.
- [Project roadmap](./docs/project-roadmap.md) — phases, gates, and gaps.
- [Project changelog](./docs/project-changelog.md) — phase evidence and boundaries.
- [Project changelog archive](./docs/project-changelog-archive.md) — older phase detail.
- [Pi-native migration](./docs/pi-native-migration.md) — Pi runtime and settings notes.
