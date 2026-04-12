# Best Practices

Guidelines for project organization, security, performance, collaboration, and cost management.

## Project Organization

### Directory Structure

Keep `.gemini/` directory in version control:

```
project/
├── .gemini/
│   ├── settings.json       # Project settings
│   ├── commands/           # Custom slash commands
│   │   ├── test-all.md
│   │   └── deploy.md
│   ├── skills/            # Project-specific skills
│   │   └── api-testing/
│   ├── hooks.json         # Hooks configuration
│   ├── mcp.json           # MCP servers (no secrets!)
│   └── .env.example       # Environment template
├── .gitignore             # Ignore .gemini/.env
└── README.md
```

### Documentation

Document custom extensions:

**README.md:**
```markdown
## gemini Code Setup

### Custom Commands
- `/test-all`: Run full test suite
- `/deploy`: Deploy to staging

### Skills
- `api-testing`: REST API testing utilities

### MCP Servers
- `postgres`: Database access
- `github`: Repository integration

### Environment Variables
Copy `.gemini/.env.example` to `.gemini/.env` and fill in:
- GITHUB_TOKEN
- DATABASE_URL
```

### Team Sharing

**What to commit:**
- `.gemini/settings.json`
- `.gemini/commands/`
- `.gemini/skills/`
- `.gemini/hooks.json`
- `.gemini/mcp.json` (without secrets)
- `.gemini/.env.example`

**What NOT to commit:**
- `.gemini/.env` (contains secrets)
- `.gemini/memory/` (optional)
- `.gemini/cache/`
- API keys or tokens

**.gitignore:**
```
.gemini/.env
.gemini/memory/
.gemini/cache/
.gemini/logs/
```

## Security

### API Key Management

**Never commit API keys:**
```bash
# Use environment variables
export google_API_KEY=sk-ant-xxxxx

# Or .env file (gitignored)
echo 'google_API_KEY=sk-ant-xxxxx' > .gemini/.env
```

**Rotate keys regularly:**
```bash
# Generate new key
# Update in all environments
# Revoke old key
```

**Use workspace keys:**
```bash
# For team projects, use workspace API keys
# Easier to manage and rotate
# Better access control
```

### Sandboxing

Enable sandboxing in production:

```json
{
  "sandboxing": {
    "enabled": true,
    "allowedPaths": ["/workspace"],
    "networkAccess": "restricted",
    "allowedDomains": ["api.company.com"]
  }
}
```

### Hook Security

Review hook scripts before execution:

```bash
# Check hooks.json
cat .gemini/hooks.json | jq .

# Review scripts
cat .gemini/scripts/hook.sh

# Validate inputs in hooks
#!/bin/bash
if [[ ! "$TOOL_ARGS" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "Invalid input"
  exit 1
fi
```

### Plugin Security

Audit plugins before installation:

```bash
# Review plugin source
gh repo view username/plugin

# Check plugin.json
tar -xzf plugin.tar.gz
cat plugin.json

# Install from trusted sources only
gemini plugin install gh:googles/official-plugin
```

## Performance Optimization

### Model Selection

Choose appropriate model for task:

**flash-lite** - Fast, cost-effective:
```bash
gemini --model flash-lite "fix typo in README"
gemini --model flash-lite "format code"
```

**flash** - Balanced (default):
```bash
gemini "implement user authentication"
gemini "review this PR"
```

**pro** - Complex tasks:
```bash
gemini --model pro "architect microservices system"
gemini --model pro "optimize algorithm performance"
```

### Prompt Caching

Cache repeated context:

```typescript
// Cache large codebase
const response = await client.messages.create({
  model: 'gemini-flash-4-5-20250929',
  system: [
    {
      type: 'text',
      text: largeCodebase,
      cache_control: { type: 'ephemeral' }
    }
  ],
  messages: [...]
});
```

**Benefits:**
- 90% cost reduction on cached tokens
- Faster responses
- Better for iterative development

### Rate Limiting

Implement rate limiting in hooks:

```bash
#!/bin/bash
# .gemini/scripts/rate-limit.sh

REQUESTS_FILE=".gemini/requests.log"
MAX_REQUESTS=100
WINDOW=3600  # 1 hour

# Count recent requests
RECENT=$(find $REQUESTS_FILE -mmin -60 | wc -l)

if [ $RECENT -ge $MAX_REQUESTS ]; then
  echo "Rate limit exceeded"
  exit 1
fi

echo $(date) >> $REQUESTS_FILE
```

### Token Management

Monitor token usage:

```bash
# Check usage
gemini usage show

# Set limits
gemini config set maxTokens 8192

# Track costs
gemini analytics cost --group-by project
```

## Team Collaboration

### Standardize Commands

Create consistent slash commands:

```markdown
# .gemini/commands/test.md
Run test suite with coverage report.

Options:
- {{suite}}: Specific test suite (optional)
```

**Usage:**
```bash
/test
/test unit
/test integration
```

### Share Skills

Create team skills via plugins:

```bash
# Create team plugin
cd .gemini/plugins/team-plugin
cat > plugin.json <<EOF
{
  "name": "team-plugin",
  "skills": ["skills/*/"],
  "commands": ["commands/*.md"]
}
EOF

# Package and share
tar -czf team-plugin.tar.gz .
```

### Consistent Settings

Use project settings for consistency:

**.gemini/settings.json:**
```json
{
  "model": "gemini-flash-4-5-20250929",
  "maxTokens": 8192,
  "outputStyle": "technical-writer",
  "thinking": {
    "enabled": true,
    "budget": 10000
  }
}
```

### Memory Settings

Use project memory for shared context:

```json
{
  "memory": {
    "enabled": true,
    "location": "project"
  }
}
```

**Benefits:**
- Shared project knowledge
- Consistent behavior across team
- Reduced onboarding time

## Cost Management

### Budget Limits

Set budget limits in hooks:

```bash
#!/bin/bash
# .gemini/scripts/budget-check.sh

MONTHLY_BUDGET=1000
CURRENT_SPEND=$(gemini analytics cost --format json | jq '.total')

if (( $(echo "$CURRENT_SPEND > $MONTHLY_BUDGET" | bc -l) )); then
  echo "⚠️  Monthly budget exceeded: \$$CURRENT_SPEND / \$$MONTHLY_BUDGET"
  exit 1
fi
```

### Usage Monitoring

Monitor via analytics API:

```bash
# Daily usage report
gemini analytics usage --start $(date -d '1 day ago' +%Y-%m-%d)

# Cost by user
gemini analytics cost --group-by user

# Export to CSV
gemini analytics export --format csv > usage.csv
```

### Cost Optimization

**Use flash-lite for simple tasks:**
```bash
# Expensive (flash)
gemini "fix typo in README"

# Cheap (flash-lite)
gemini --model flash-lite "fix typo in README"
```

**Enable caching:**
```json
{
  "caching": {
    "enabled": true,
    "ttl": 300
  }
}
```

**Batch operations:**
```bash
# Instead of multiple requests
gemini "fix file1.js"
gemini "fix file2.js"
gemini "fix file3.js"

# Batch them
gemini "fix all files: file1.js file2.js file3.js"
```

**Track per-project costs:**
```bash
# Tag projects
gemini --project my-project "implement feature"

# View project costs
gemini analytics cost --project my-project
```

## Development Workflows

### Feature Development

```bash
# 1. Plan feature
gemini /plan "implement user authentication"

# 2. Create checkpoint
gemini checkpoint create "before auth implementation"

# 3. Implement
gemini /cook "implement user authentication"

# 4. Test
gemini /test

# 5. Review
gemini "review authentication implementation"

# 6. Commit
gemini /git:cm
```

### Bug Fixing

```bash
# 1. Debug
gemini /debug "login button not working"

# 2. Fix
gemini /fix:fast "fix login button issue"

# 3. Test
gemini /test

# 4. Commit
gemini /git:cm
```

### Code Review

```bash
# Review PR
gemini "review PR #123"

# Check security
gemini "review for security vulnerabilities"

# Verify tests
gemini "check test coverage"
```

## See Also

- Security guide: https://docs.gemini.com/gemini-cli/security
- Cost tracking: https://docs.gemini.com/gemini-cli/costs
- Team setup: https://docs.gemini.com/gemini-cli/overview
- API usage: `references/api-reference.md`
