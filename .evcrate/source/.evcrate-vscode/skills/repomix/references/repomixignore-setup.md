# .repomixignore Setup

`.repomixignore` excludes files from Repomix that shouldn't be in `.gitignore`. Critical for dot-folders containing AI configs, IDE files, and tooling.

## Why It's Needed

- `.gitignore` typically covers source artifacts but NOT dot-folders like `.evcrate-vscode/`, `.idea/`
- `.evcrate-vscode/` contains agent configs, scripts, potential secrets — must be excluded
- Pattern precedence: `.repomixignore` > config > `.gitignore` > defaults

## Setup Workflow

Before first repomix run:

```bash
# Check if .repomixignore exists
ls .repomixignore 2>/dev/null && echo "exists" || echo "missing"

# Create from skill template
cp .evcrate-vscode/skills/repomix/assets/.repomixignore .repomixignore

# Or verify what's excluded
cat .repomixignore
```

## Always Exclude (Dot-folders)

```
.evcrate-vscode/        # AI tooling configs, scripts, potential secrets
.git/           # Version control internals
.idea/          # JetBrains IDE
.vscode/        # VS Code settings
.cursor/        # Cursor IDE
.next/          # Next.js build cache
.nuxt/          # Nuxt.js build cache
.expo/          # Expo (React Native) cache
```

## Template Location

The full template is at `.evcrate-vscode/skills/repomix/assets/.repomixignore`.

It covers:
- All common dot-folders
- Build artifacts (`dist/`, `build/`, `*.min.js`)
- Dependencies (`node_modules/`, `vendor/`)
- Runtime/cache (`__pycache__/`, `.turbo/`, `.vercel/`)
- Large binary files (`*.mp4`, `*.zip`, `*.exe`)
- Lock files (`package-lock.json`, `yarn.lock`, `bun.lockb`)
- Repomix output files (`repomix-output.*`)

## Project-Specific Additions

Add project-specific patterns below the template:

```
# Project-specific
data/
*.csv
secrets/
```

## Verification

After setup, confirm `.evcrate-vscode/` is excluded:
```bash
repomix --verbose 2>&1 | grep -i "claude\|skipping"
```
