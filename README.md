# EVCrate

EVCrate is a private Node/TypeScript package that authors one agent-harness source
tree, builds verified projections for seven targets, and publishes managed output
with explicit ownership, hashing, locking, and recovery rules. It also ships one
shared checkpoint advisor controller.

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
   - `evcrate-v<version>-linux-x64.tar.gz`
   - `evcrate-v<version>-linux-x64.tar.gz.sha256`
   - `evcrate-v<version>.release.json`

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
   - `evcrate-v<version>-windows-x64.zip`
   - `evcrate-v<version>-windows-x64.zip.sha256`
   - `evcrate-v<version>.release.json`

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
  "version": 1,
  "advisor": {
    "backend": "codex",
    "model": "gpt-5.6-sol",
    "effort": "high",
    "timeout_ms": 900000
  }
}
```

The controller accepts one direct ten-key checkpoint object on stdin and emits one
frozen JSON envelope. Missing or malformed policy, unsafe paths, failed probes,
timeouts, cancellation, and final-process failures fail closed; there is no retry,
provider switch, model substitution, or local fallback. The controller is published
once to `$HOME/.evcrate/bin/evcrate-advisor`; policy remains user-owned and is never
published. Read the [architecture contract](./docs/system-architecture.md) before
qualifying a live CLI.

A final standalone `--advice` token requests checkpoint counsel in the bootstrap,
code, cook, and fix workflows. `@advisor` remains ordinary task text. The separate
inline advice workflow does not use checkpoint routing policy.

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
