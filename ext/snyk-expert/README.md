# @evcrate/snyk-expert

Portable `.agents/` Snyk CLI, bounded remediation coordinator, and ecosystem remediation skills with a zero-dependency project-local installer.

## Overview

`@evcrate/snyk-expert` bundles portable specialist agent instructions, a main-owned remediation coordinator, and independently reusable task skills into a target project's `.agents/` directory:

- **Remediation Coordinator Command (`.agents/skills/cmd-snyk-remediate`)**: Main-owned coordinator managing bounded review/correction loops, positive attempt budget $N$, approval gates, restart-safe attempt history, lossless ledger reconciliation, and live terminal Snyk scans.
- **Specialist Agent (`.agents/agents/snyk-expert.md`)**: Executes one coherent dependency-owner set and owns local verification (effective graph, native build/test, affected consumer probes), handing off to Main with local verification evidence while Main retains live scan and terminal review ownership.
- **CLI Workflow Skill (`.agents/skills/snyk-cli`)**: Setup verification, operator-authorized installation, browser OAuth login (`snyk auth`), headless/CI `SNYK_TOKEN` injection, separate SCA (`snyk test`) and SAST (`snyk code test`) scanning, exit code 0/1/2/3 preservation, version-gated HTML generation, and private target-contained evidence storage bindings with unsafe-storage pause.
- **Remediation Skill (`.agents/skills/snyk-fix`)**: Lossless finding extraction, package-to-owner reconciliation, lockfile synchronization, verified dependency updates for Node.js/TypeScript (npm, Yarn Classic/Modern, pnpm) and Maven/Spring projects, and general 6-point pre-edit procedure evaluation for supported package managers.
- **Dependency Upgrade Review Skill (`.agents/skills/dependency-upgrade-review`)**: Read-only compatibility evaluation assessing candidate jumps, peer dependencies, Node engine bounds, module formats (ESM/CJS), and `@types/*` companion package alignment, executing with zero target edits.

## Installation via Local Assets or npx

Install the bundle directly into any project using the zero-dependency CLI installer:

```bash
# Preview installation before writing files:
node bin/install.js --help
node bin/install.js --target agents --directory /path/to/project --dry-run

# Run installation:
node bin/install.js --target agents --directory /path/to/project

# Or via npx (when package is available locally or in registry):
npx @evcrate/snyk-expert --target agents --directory /path/to/project
```

The installer requires `--target agents` and an explicit project root via `--directory`, installing into `<project-root>/.agents/`.

### CLI Installer Safety Guarantees & Operating Limits

- **Project-Local Only**: Installs strictly into the project's `.agents/` directory. Requires an explicit non-symbolic-link project directory via `--directory` and `--target agents`.
- **Collision Detection & Protection**: Existing files that differ trigger collision warnings and fail closed. Overwrite requires explicit `--force` plus interactive confirmation (or non-interactive `--force --yes`). `--yes` alone without `--force` is rejected. Unrelated files in the destination are preserved untouched.
- **Installer Process Locking & Stale Lock**: Process-level lockfile (`.install.lock`) prevents concurrent execution conflicts between cooperating installer instances on the same destination root. If an installer is terminated abruptly, verify no installer process is active before removing the stale `.install.lock`.
- **Pre-execution Drift Checks**: Detects destination file changes between planning and execution or concurrent file creation, failing closed without corruption.
- **Staged Temporary Files & Best-Effort Rollback on Error**: Files are staged to temporary files (`.tmp-<uuid>`) in destination directories and published per file. If a fault occurs during staging or copying, the installer removes temporary files, performs best-effort restoration of replaced file backups, deletes created files, and prunes empty temporary directories.
- **Trusted Writer Boundary**: Preflight symlink and collision checks defend against misconfigurations. The installer assumes trusted exclusive access to the target tree; concurrent external writers or in-flight directory swaps are outside the installer's boundary.
- **Symlink Defense**: Rejects destination paths or components containing symlinks that escape the target project root or resolve to symlinked leaves.

## Bundle Structure

```text
<project-root>/
└── .agents/
    ├── agents/snyk-expert.md
    └── skills/
        ├── cmd-snyk-remediate/
        │   └── SKILL.md
        ├── snyk-cli/
        │   ├── SKILL.md
        │   └── references/cli-workflow.md
        ├── snyk-fix/
        │   ├── SKILL.md
        │   └── references/
        │       ├── finding-and-owner-contract.md
        │       ├── maven-spring-remediation.md
        │       ├── node-typescript-remediation.md
        │       └── verification-and-results.md
        └── dependency-upgrade-review/
            ├── SKILL.md
            └── references/
                ├── compatibility-evidence.md
                └── review-output.md
```

## Documentation

- **[docs/usage.md](docs/usage.md)**: Comprehensive operational guide, CLI workflows, scanning parameters, and delegation templates.
- **Repository Guide**: See `docs/snyk-expert-cli.md` in the EVCrate repository root.

## License

MIT
