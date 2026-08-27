# Audit & Workflow Integration

## Security Audit

### Third-Party Library
```bash
npx repomix --remote vendor/library --style xml -o audit.xml
```
**Check for:** API keys, hardcoded credentials, network calls, obfuscation, malicious patterns

### Pre-Deployment
```bash
repomix --include "src/**,config/**" --style xml -o pre-deploy-audit.xml
```
**Checklist:** No sensitive data, no test credentials, env vars correct, security practices, no debug code

### Dependency Audit
```bash
repomix --include "**/package.json,**/package-lock.json" -o deps.md --style markdown
repomix --include "node_modules/suspicious-package/**" -o dep-audit.xml
```

## Workflow Integration

### CI/CD (GitHub Actions)
```yaml
- name: Generate Snapshot
  run: |
    npm install -g repomix
    repomix --style markdown -o release-snapshot.md
- name: Upload Artifact
  uses: actions/upload-artifact@v3
  with: {name: repo-snapshot, path: release-snapshot.md}
```

### Git Hook
```bash
#!/bin/bash
# .git/hooks/pre-commit
git diff --cached --name-only > staged-files.txt
repomix --include "$(cat staged-files.txt | tr '\n' ',')" -o .context/latest.xml
```

### VS Code evcrate_subagent
```json
{"version": "2.0.0", "tasks": [{"label": "Package for AI", "type": "shell", "command": "repomix --include 'src/**' --remove-comments --copy"}]}
```

## Language-Specific Patterns

| Language | Command | Exclude |
|---|---|---|
| TypeScript | `repomix --include "**/*.ts,**/*.tsx" --remove-comments` | `**/*.test.ts`, `dist/` |
| React | `repomix --include "src/**/*.{js,jsx,ts,tsx}" -i "build/,*.test.*"` | `build/`, tests |
| Node.js | `repomix --include "src/**/*.js,config/**" -i "node_modules/,logs/"` | deps, logs |
| Python | `repomix --include "**/*.py,requirements.txt,*.md" -i "**/__pycache__/,venv/"` | pycache, venv |
| Monorepo | `repomix --include "packages/*/src/**" -i "packages/*/node_modules/"` | per-package deps |

## Troubleshooting

| Problem | Fix |
|---|---|
| Output too large | `repomix -i "node_modules/**,dist/**" --include "src/core/**" --remove-comments --no-line-numbers` |
| Missing files | `cat .gitignore .repomixignore && repomix --no-gitignore --no-default-patterns --verbose` |
| Sensitive data warnings | Review files → add to `.repomixignore` → use `--no-security-check` for false positives |
| Slow on large repo | `repomix --include "src/**/*.ts" -i "node_modules/**,dist/**,vendor/**"` |
| Remote access fail | Use full URL: `npx repomix --remote https://github.com/owner/repo` |
