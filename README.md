# EVCrate

EVCrate is a private Node/TypeScript package that authors one agent-harness source
tree, builds verified projections for seven targets, and publishes managed output
with explicit ownership, hashing, locking, and recovery rules. It also ships one
shared checkpoint advisor controller.
**Release:** 2.0.0 (`628183eb`); deterministic acceptance is complete, while live
vendor qualification and production HOME publication remain operator-gated.

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

The compiled CLI is `dist/cli/evcrate.js`:

```bash
node dist/cli/evcrate.js version --json
node dist/cli/evcrate.js health --json
node dist/cli/evcrate.js publish --dry-run --json
node dist/cli/evcrate.js publish --apply --json
node dist/cli/evcrate.js recover --json
```

Publication consumes only a current verified build, preserves unmanaged HOME files, and keeps the user-owned advisor policy separate. See [system architecture](./docs/system-architecture.md) for staging, hash, atomic promotion, and recovery rules.

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
- [Project changelog](./docs/project-changelog.md) — historical phase evidence and
  explicit non-claims.
- [Pi-native migration](./docs/pi-native-migration.md) — Pi-specific runtime,
  settings, and migration boundaries.
