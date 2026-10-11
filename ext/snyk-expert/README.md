# @evcrate/snyk-expert

Portable `.agents/` Snyk CLI, Node.js/TypeScript, and Maven/Spring remediation skills with a zero-dependency project-local installer.

## Overview

`@evcrate/snyk-expert` bundles portable specialist agent instructions and independently reusable task skills into a target project's `.agents/` directory:

- **Specialist Agent (`.agents/agents/snyk-expert.md`)**: Single decision owner orchestrating Snyk scanning, lossless finding-to-owner mapping, and human-in-the-loop remediation.
- **CLI Workflow Skill (`.agents/skills/snyk-cli`)**: Setup verification, operator-authorized installation, browser OAuth login (`snyk auth`), headless/CI `SNYK_TOKEN` injection, separate SCA (`snyk test`) and SAST (`snyk code test`) scanning, exit code 0/1/2/3 preservation, and version-gated HTML generation.
- **Remediation Skill (`.agents/skills/snyk-fix`)**: Lossless finding extraction, package-to-owner reconciliation, lockfile synchronization, and verified dependency updates for Node.js/TypeScript (npm, Yarn Classic/Modern, pnpm) and Maven/Spring projects.
- **Dependency Upgrade Review Skill (`.agents/skills/dependency-upgrade-review`)**: Read-only compatibility evaluation assessing candidate jumps, peer dependencies, Node engine bounds, module formats (ESM/CJS), and `@types/*` companion package alignment.

## Installation via npx / npm

Install the bundle directly into any project using the zero-dependency CLI installer matching the `@evcrate/sonarqube-test-quality` contract:

```bash
# Preview installation before writing files:
node bin/install.js --help
node bin/install.js --target agents --directory /path/to/project --dry-run

# Run installation:
node bin/install.js --target agents --directory /path/to/project

# Or via npx:
npx @evcrate/snyk-expert --target agents --directory /path/to/project
```

The installer requires `--target agents` and an explicit project root via `--directory`, installing into `<project-root>/.agents/`.

### CLI Installer Safety Guarantees

- **Project-Local Only**: Installs strictly into the project's `.agents/` directory. Requires an explicit non-symbolic-link project directory.
- **Collision Detection & Protection**: Existing files that differ trigger collision warnings and fail closed. Overwrite requires explicit `--force` plus interactive confirmation (or non-interactive `--force --yes`). `--yes` alone without `--force` is rejected.
- **Exclusive Locking**: Exclusive installation locking (`.install.lock`) prevents concurrent installer conflicts.
- **Pre-execution Drift & Race Checks**: Detects destination file changes between planning and execution or concurrent file creation, failing closed without corruption.
- **Atomic Staging & Rollback**: Files are staged to temporary files in destination directories; if a fault occurs during replacement, the installer automatically rolls back to the previous usable installation and prunes empty temporary directories.
- **Preserves Pre-existing Files**: Pre-existing unrelated files and directories in the target are preserved untouched.
- **Symlink Defense**: Rejects destination paths or components containing symlinks that escape the target project root.

## Bundle Structure

```text
<installed-resource-root>/
└── .agents/
    ├── agents/snyk-expert.md
    └── skills/
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
