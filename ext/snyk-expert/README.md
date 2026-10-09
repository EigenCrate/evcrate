# @evcrate/snyk-expert

Portable `.agents/` Snyk CLI, Node.js/TypeScript, and Maven/Spring remediation skills with a zero-dependency project-local installer.

## Overview

`@evcrate/snyk-expert` bundles portable specialist agent instructions and independently reusable task skills into a target project's `.agents/` directory:

- **Specialist Agent (`.agents/agents/snyk-expert.md`)**: Single decision owner orchestrating Snyk scanning, lossless finding-to-owner mapping, and human-in-the-loop remediation.
- **CLI Workflow Skill (`.agents/skills/snyk-cli`)**: Setup verification, operator-authorized installation, browser OAuth login (`snyk auth`), headless/CI `SNYK_TOKEN` injection, separate SCA (`snyk test`) and SAST (`snyk code test`) scanning, exit code 0/1/2/3 preservation, and version-gated HTML generation.
- **Remediation Skill (`.agents/skills/snyk-fix`)**: Lossless finding extraction, package-to-owner reconciliation, lockfile synchronization, and verified dependency updates for Node.js/TypeScript (npm, Yarn Classic/Modern, pnpm) and Maven/Spring projects.
- **Dependency Upgrade Review Skill (`.agents/skills/dependency-upgrade-review`)**: Read-only compatibility evaluation assessing candidate jumps, peer dependencies, Node engine bounds, module formats (ESM/CJS), and `@types/*` companion package alignment.

## Installation via npx / npm

Install the bundle directly into any project using the zero-dependency CLI installer:

```bash
# In your target project:
npx @evcrate/snyk-expert

# Or specify a target directory explicitly:
npx @evcrate/snyk-expert --target /path/to/project

# Dry run to preview additions and unchanged files:
npx @evcrate/snyk-expert --dry-run

# Local execution from repository checkout:
node ext/snyk-expert/bin/install.js --target /path/to/project
```

### CLI Installer Safety Guarantees

- **Project-Local Only**: Installs strictly into the project's `.agents/` directory. Refuses to default to user `$HOME` to prevent polluting global configurations.
- **Collision Detection & Protection**: Existing files that differ trigger collision warnings and fail closed. Overwrite requires explicit `--force` plus interactive confirmation (or non-interactive `--force --yes`). `--yes` alone without `--force` is rejected.
- **Atomic Staging & Integrity**: Files are staged to temporary files in destination directories and atomically moved (`renameSync`) with complete byte-level integrity verification.
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
