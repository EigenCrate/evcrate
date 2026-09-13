# EVCrate

EVCrate is a private Node/TypeScript package that authors one agent-harness source
tree, builds verified projections for seven targets, and publishes managed output
with explicit ownership, hashing, locking, and recovery rules. It also ships one
shared checkpoint advisor controller.
**Release:** 2.0.0 (`628183eb`). Hook Materialization Scope Distribution is
complete through Phase 09: 512/512 tests pass across 14 suites, the 29-file
controller closure verifies, and installed Linux release fixtures prove HOME and
project publication/recovery. Live vendor qualification and production HOME
publication remain operator-gated; Windows runtime equivalence, npm publication,
deployment, and rollout are not claimed.

## Download & installation

EVCrate provides standalone, registry-free unpack installers for Linux and Windows, as well as a developer workflow from source checkout.

### Prerequisites

- **Node.js**: `>=22.19.0` (required on `$PATH`)
- **Architecture**: `x86_64` (Linux) / `x64` (Windows)

---

### Standalone installation (recommended)

Download the release assets corresponding to your operating system from [GitHub Releases](https://github.com/EigenCrate/evcrate/releases).

#### Linux (x86_64)

1. **Download release assets** into the same directory:
   - `install.sh`
   - `evcrate-v2.0.0-linux-x64.tar.gz`
   - `evcrate-v2.0.0-linux-x64.tar.gz.sha256`
   - `evcrate-v2.0.0.release.json`

2. **Make the installer executable and install**:
   ```bash
   chmod +x install.sh
   ./install.sh install
   ```

3. **Verify installation**:
   Ensure `~/.local/bin` is in your `$PATH`:
   ```bash
   export PATH="$HOME/.local/bin:$PATH"
   evcrate version --json
   evcrate health --json
   ```

   **Default install locations**:
   - Launcher: `~/.local/bin/evcrate`
   - Data directory: `~/.local/share/evcrate/` (or `$XDG_DATA_HOME/evcrate`)
   - State directory: `~/.local/state/evcrate/` (or `$XDG_STATE_HOME/evcrate`)

   **Lifecycle commands**:
   ```bash
   ./install.sh repair               # Re-verify and repair current installation
   ./install.sh rollback <snapshot>  # Roll back to a preserved prior snapshot
   ./install.sh uninstall            # Safely remove launcher and installer-owned roots
   ```

   > **Note on installer rollback vs. publication recovery**: The installer's `rollback` and `uninstall` commands manage only installer-owned files (the launcher, unpack data directory, and installer state). They never mutate or roll back harness publications or journals in `$HOME` or project workspaces. Harness publications and recovery are managed exclusively through `evcrate publish` and `evcrate recover`.

#### Windows (x64)

1. **Download release assets** into the same folder:
   - `install.ps1`
   - `evcrate-v2.0.0-windows-x64.zip`
   - `evcrate-v2.0.0-windows-x64.zip.sha256`
   - `evcrate-v2.0.0.release.json`

2. **Run the installer in PowerShell**:
   ```powershell
   .\install.ps1 install
   ```

3. **Verify installation**:
   ```powershell
   evcrate version --json
   evcrate health --json
   ```

   **Default install locations**:
   - Launcher: `%LOCALAPPDATA%\EVCrate\bin\evcrate.cmd`
   - Data directory: `%LOCALAPPDATA%\EVCrate\data\`
   - State directory: `%LOCALAPPDATA%\EVCrate\state\`

   **Lifecycle commands**:
   ```powershell
   .\install.ps1 repair              # Repair current installation
   .\install.ps1 rollback <snapshot> # Roll back to a prior snapshot
   .\install.ps1 uninstall           # Safely remove launcher and installer roots
   ```

   > **Note on installer rollback vs. publication recovery**: The installer's `rollback` and `uninstall` commands manage only installer-owned files (the launcher, unpack data directory, and installer state). They never mutate or roll back harness publications or journals in `$HOME` or project workspaces. Harness publications and recovery are managed exclusively through `evcrate publish` and `evcrate recover`.

---

### Developer quick start (from source)

From a cloned repository checkout:

```bash
npm install
npm run build
npm run distribute:build
npm run distribute:check
```

`build` compiles the TypeScript control plane and regenerates the controller inventory. `distribute:build` and `distribute:check` build and verify local projections.

The compiled CLI is `dist/cli/evcrate.js` (or `evcrate` when installed):

```bash
node dist/cli/evcrate.js version --json
node dist/cli/evcrate.js health --json
```

### Publication and recovery (operator guide)

EVCrate supports scope-aware publication with `--scope home|project` (defaulting to `home`).

#### 1. CLI commands and examples

```bash
# Default HOME publication (dry-run and apply)
evcrate publish --dry-run --json
evcrate publish --apply --json

# Explicit HOME publication root
evcrate publish --apply --scope home --home ~/.local-test --json

# Project-scoped publication (publishes harness into project workspace)
evcrate publish --apply --scope project --project-root /path/to/project --json

# Target-filtered publication (only selected harnesses published)
evcrate publish --apply --scope project --project-root /path/to/project --target claude --target codex --json

# Scope-specific publication recovery
evcrate recover --scope home --json
evcrate recover --scope project --project-root /path/to/project --json
```

**Key CLI rules**:
- `--scope home|project` is scalar and defaults to `home`. It is accepted only on direct `publish`, `recover`, and `distribute publish|all|recover`.
- `--home <dir>` selects the shared infrastructure root in every scope. In `home` scope, it is also the harness destination.
- `--project-root <dir>` provides invocation context and becomes the harness destination when `--scope project`. It must be a real, owner-controlled, non-symlink directory. Its canonical path produces a 64-hex SHA-256 `projectIdentity`.
- `--target <target>` filters harness projections only. The shared advisor controller closure (`.evcrate/bin`) is **always** published under `--home` and is **never** filtered by `--target`.

#### 2. Seven-target destination matrix

| Target | Source / declarations | HOME harness destination | Project harness destination |
|---|---|---|---|
| **Claude** | `.claude` | `<home>/.claude` | `<project>/.claude` |
| **Codex** | `.codex`, `.agents`, `AGENTS.md` | `<home>/.agents`, then `<home>/.codex` (no root doc) | `<project>/.codex`, `<project>/.agents`, then `<project>/AGENTS.md` in declaration order |
| **Gemini** | `.gemini`, `GEMINI.md` | `<home>/.gemini` (no root doc) | `<project>/.gemini`, then `<project>/GEMINI.md` |
| **Antigravity** | `.antigravity` | `<home>/.gemini/config` (via structured HOME mapping) | `<project>/.antigravity` unchanged |
| **Pi** | `.pi` | `<home>/.pi` | `<project>/.pi` |
| **OMP** | `.omp` | `<home>/.omp` (with declared HOME path mapping) | `<project>/.omp` unchanged |
| **Copilot** | `.copilot` | `<home>/.copilot` | `<project>/.copilot` |
| *Shared controller* | `.evcrate/bin` | `<home>/.evcrate/bin` | *Not published to project* (always HOME-owned) |

Installed wrappers resolve child resources from their own location, while runtime environment and `process.cwd()` remain active project workspace data. Structured HOME materialization modifies only validated configuration fields (such as Antigravity mapping into `.gemini/config`).

#### 3. Transaction semantics and partial outcomes

- **HOME publication**: Executes as a single atomic transaction. Both `shared` and `harness` records share a single `releaseId` and bounded retention cleanup.
- **Project publication**: Executes in two ordered phases:
  1. Commits the shared controller to `--home` in an independent transaction.
  2. Acquires the project workspace lock (never reverse-locking) and applies the harness projections to `--project-root`.
- **Partial results (exit code 5)**:
  - If project harness application fails after shared commit, the publisher rolls back only the project workspace. Shared HOME is **never** rolled back or compensated.
  - If project rollback succeeds, the CLI exits with code `5`, status `'partial'`, and error code `PUBLICATION_FAILED`.
  - If project rollback fails, the CLI exits with code `5`, status `'partial'`, and error code `ROLLBACK_FAILED`. The project journal is preserved intact for operator recovery.

#### 4. Recovery and quiescence runbook

1. Ensure target agent processes are **quiescent** (no active processes modifying settings or sessions).
2. Validate workspace ownership and ensure non-symlink path ancestry.
3. Run recovery matching the failed scope:
   - For HOME: `evcrate recover --scope home --json` (reads only HOME state).
   - For Project: `evcrate recover --scope project --project-root /path/to/project --json` (validates canonical `projectIdentity` and inspects only project state).
4. Broad age-based or wildcard cleanup is strictly prohibited. Recovery never crosses scope boundaries.

*Note on runtime qualification*: Runtime verification and qualification are verified on Linux (`x86_64`). Windows standalone archive packaging is supported, but Windows runtime equivalence is not claimed.

Publication consumes only a current verified build, preserves unmanaged HOME and project files, and keeps the user-owned advisor policy separate. See [system architecture](./docs/system-architecture.md) for staging, hash, atomic promotion, and recovery rules.
### Development & modification workflow

When adding, updating, or modifying commands, skills, or controller files:

1. **Edit canonical sources**:
   - Edit commands in `.evcrate/source/.claude/commands/`.
   - Edit skills in `.evcrate/source/.claude/skills/`.
   - Edit controller logic in `.evcrate/source/.evcrate/bin/`.

2. **Update target projections**:
   Project changes from canonical sources into all 7 target trees (`.agents/`, `.codex/`, `.gemini/`, `.antigravity/`, `.pi/`, `.omp/`, `.copilot/`):
   ```bash
   npm run distribute:build
   npm run distribute:check
   ```

3. **Regenerate resource registry & build manifests**:
   Every target projection tree is cryptographically pinned by SHA-256 tree hashes in `.evcrate/build-manifest-*.json` and indexed in `.evcrate/registry.json`. Whenever files in `.evcrate/source/` change, synchronize the manifests:
   ```bash
   npm run generate:all
   ```
   *(Alternatively, run `npm run generate:registry` and `npm run generate:manifests` individually.)*

4. **Run test verification**:
   Verify that all target contracts, CLI commands, and publication checks pass locally before pushing:
   ```bash
   npm test
   ```
   To quickly test CLI publication and manifest verification:
   ```bash
   npm run test:cli
   npm run test:publication
   ```

5. **Commit sources and manifests together**:
   Always stage the generated manifests alongside the source modifications:
   ```bash
   git add .evcrate/source/ .evcrate/build-manifest*.json .evcrate/registry.json
   git commit -m "feat(commands): description of your change"
   git push origin main
   ```

## Source and generated boundaries

- `.evcrate/source/.claude/` is the canonical harness authoring tree.
- `.evcrate/source/.evcrate/bin/` is the sole authored shared advisor-controller
  source.
- `.evcrate/targets/` contains schema-2 target manifests and overlays.
- `.evcrate/source/.agents/`, `.codex/`, `.gemini/`, `.antigravity/`, `.pi/`,
  `.omp/`, and `.copilot/` are generated projections. Do not hand-edit them.
- `.evcrate/registry.json` is a separate schema-1 canonical resource registry.

The package exposes `evcrate` (`dist/cli/evcrate.js`) and `evcrate-advisor`
(`.evcrate/source/.evcrate/bin/evcrate-advisor`). The TypeScript path is current;
there is no root `distribute.py` command in the current repository inventory.

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

Use distinct routes. Enabled controller backends are `claude`, `codex`, `pi`, and
`omp`; `antigravity` is unavailable, and Gemini/Copilot are not controller
backends. Replace `operator-selected` with model IDs qualified for each backend.
`timeout_ms` is retired from v2 routes.

For an existing policy, migrate explicitly and non-clobberingly:

1. Back up the file without overwriting an existing backup:
   ```bash
   node -e 'const fs = require("node:fs"); fs.writeFileSync(process.env.HOME + "/.evcrate/advisor-routing.json.pre-v2", fs.readFileSync(process.env.HOME + "/.evcrate/advisor-routing.json"), { flag: "wx", mode: 0o600 })'
   ```
2. Retrieve the current revision and mode:
   ```bash
   evcrate advisor settings get --json
   ```
3. Prepare a v2 preview request file, then inspect its one-time token:
   ```bash
   evcrate advisor settings preview --json --request-file <req.json>
   ```
4. Put that token and the current revision in an apply request file and commit:
   ```bash
   evcrate advisor settings apply --json --request-file <apply.json>
   ```

The controller accepts the v2 checkpoint (plus an explicit v1 compatibility
checkpoint) and emits one terminal JSON envelope. V2 retries only transient
primary failures: up to four sequential launches with cancellable 10/20/30-second
backoff, then one invocation of the configured backup after four failures or a
preflight skip. Backup failure is terminal; there is no provider substitution,
parallel hedge, or local fallback. Policy remains user-owned and is never
published. Read the [architecture contract](./docs/system-architecture.md) before
qualifying a live CLI.

A final standalone `--advice` token activates formal `evcrate-advisor-checkpoint/v2`
mentoring during bootstrap, code, cook, and fix reviews, for up to three correction
cycles. `@advisor` remains ordinary task text. The documentation-facing
`/cmd-advise` name (the `/advise` command) is a separate interview-first main-session
workflow and does not use checkpoint routing policy.

## Documented command names

All documentation and target-facing examples use a literal `cmd` prefix for slash
command/resource names, including `.claude` references:

```text
/cmd-plan "design the change"
/cmd-cook "implement the approved plan"
/cmd-code plans/example.md --advice
/cmd-review__codebase "check the source boundary"
/cmd-docs__update
/cmd-watzup
```

OMP nested names use `__` (for example `/cmd-fix__hard`). Copilot projects that
resource as `/evcrate-cmd-fix-hard` and passes raw arguments through `$ARGUMENTS`.
The generated `evcrate/command-name-map.json` is authoritative for those target
translations.

This is a documentation/target convention, not a completed source rename. The
canonical `.claude` scanner still derives names from paths and the TypeScript CLI
parser accepts bare operational action names; prefix enforcement is a follow-up.
Do not hand-edit `.claude` projections or invent aliases. Shell commands such as
`npm`, `node`, `cp`, and `export` remain ordinary executable syntax.

## Documentation map

- [System architecture](./docs/system-architecture.md) — central distribution,
  advisor, supervision, wire, isolation, and publication contracts.
- [Project overview and PDR](./docs/project-overview-pdr.md) — product intent,
  functional requirements, acceptance criteria, and release gates.
- [Code standards](./docs/code-standards.md) — implementation, protocol, naming,
  filesystem, transaction, and review standards.
- [Codebase summary](./docs/codebase-summary.md) — source/module and generated-output
  map derived from the repository compaction.
- [Project roadmap](./docs/project-roadmap.md) — phase status, next gates, and gaps.
- [Project changelog](./docs/project-changelog.md) — historical phase evidence
  and explicit non-claims.
- [Project changelog archive](./docs/project-changelog-archive.md) — older phase
  detail retained outside the maintained current-milestone mirror.
- [Pi-native migration](./docs/pi-native-migration.md) — Pi-specific runtime,
  settings, and migration boundaries.
