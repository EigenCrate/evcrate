# Configuration Reference

Detailed configuration options for Repomix.

## Configuration File

Create `repomix.config.json` in project root:

```json
{
  "output": {
    "filePath": "repomix-output.xml",
    "style": "xml",
    "removeComments": false,
    "showLineNumbers": true,
    "copyToClipboard": false
  },
  "include": ["**/*"],
  "ignore": {
    "useGitignore": true,
    "useDefaultPatterns": true,
    "customPatterns": ["additional-folder", "**/*.log", "**/tmp/**"]
  },
  "security": {
    "enableSecurityCheck": true
  }
}
```

### Key Options

| Option | Default | Description |
|---|---|---|
| `output.style` | `xml` | Format: `xml`, `markdown`, `json`, `plain` |
| `output.removeComments` | `false` | Strip comments from 20+ languages |
| `output.showLineNumbers` | `true` | Include line numbers |
| `ignore.useGitignore` | `true` | Respect `.gitignore` |
| `ignore.useDefaultPatterns` | `true` | Use built-in ignore patterns |
| `security.enableSecurityCheck` | `true` | Scan with Secretlint |

## Glob Patterns

```
*     - any chars except /
**    - any chars including /
?     - single char
[abc] - char from set
{js,ts} - either extension
```

**Examples:** `**/*.ts`, `src/**`, `**/*.{js,jsx,ts,tsx}`, `!**/*.test.ts`

## CLI Flags

```bash
repomix --include "src/**/*.ts,*.md"  # Include patterns
repomix -i "tests/**,*.test.js"        # Ignore patterns
repomix --no-gitignore                 # Disable .gitignore
repomix --no-default-patterns          # Disable defaults
```

## .repomixignore

Create `.repomixignore` for Repomix-specific exclusions (gitignore format). Critical for excluding dot-folders not in `.gitignore`:

```
# Dot-folders (AI tooling, IDE, VCS)
.antigravity/
.git/
.idea/
.vscode/

# Build artifacts
dist/
build/
*.min.js

# Sensitive files
.env*
secrets/
*.key
```

See [.repomixignore Setup](./repomixignore-setup.md) for full template and setup workflow.

## Pattern Precedence

1. CLI ignore patterns (`-i`)
2. `.repomixignore` file
3. Custom patterns in config
4. `.gitignore` (if enabled)
5. Default patterns (if enabled)
