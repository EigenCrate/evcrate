# Configuration and Settings

Configure gemini Code behavior with settings hierarchy, model selection, and output styles.

## Settings Hierarchy

Settings are applied in order of precedence:

1. **Command-line flags** (highest priority)
2. **Environment variables**
3. **Project settings** (`.gemini/settings.json`)
4. **Global settings** (`~/.gemini/settings.json`)

## Settings File Format

### Global Settings
`~/.gemini/settings.json`:
```json
{
  "model": "gemini-flash-4-5-20250929",
  "maxTokens": 8192,
  "temperature": 1.0,
  "thinking": {
    "enabled": true,
    "budget": 10000
  },
  "outputStyle": "default",
  "memory": {
    "enabled": true,
    "location": "global"
  }
}
```

### Project Settings
`.gemini/settings.json`:
```json
{
  "model": "gemini-flash-4-5-20250929",
  "maxTokens": 4096,
  "sandboxing": {
    "enabled": true,
    "allowedPaths": ["/workspace"]
  },
  "memory": {
    "enabled": true,
    "location": "project"
  }
}
```

## Key Settings

### Model Configuration

**model**: gemini model to use
- `gemini-flash-4-5-20250929` (default, latest flash)
- `gemini-pro-4-20250514` (pro for complex tasks)
- `gemini-flash-lite-4-20250408` (flash-lite for speed)

**Model aliases:**
- `flash`: Latest gemini flash
- `pro`: Latest gemini pro
- `flash-lite`: Latest gemini flash-lite
- `proplan`: pro with extended thinking for planning

```json
{
  "model": "flash"
}
```

### Token Settings

**maxTokens**: Maximum tokens in response
- Default: 8192
- Range: 1-200000

```json
{
  "maxTokens": 16384
}
```

**temperature**: Randomness in responses
- Default: 1.0
- Range: 0.0-1.0
- Lower = more focused, higher = more creative

```json
{
  "temperature": 0.7
}
```

### Thinking Configuration

**Extended thinking** for complex reasoning:

```json
{
  "thinking": {
    "enabled": true,
    "budget": 10000,
    "mode": "auto"
  }
}
```

**Options:**
- `enabled`: Enable extended thinking
- `budget`: Token budget for thinking (default: 10000)
- `mode`: `auto` | `manual` | `disabled`

### Sandboxing

Filesystem and network isolation:

```json
{
  "sandboxing": {
    "enabled": true,
    "allowedPaths": [
      "/workspace",
      "/home/user/projects"
    ],
    "networkAccess": "restricted",
    "allowedDomains": [
      "api.example.com",
      "*.trusted.com"
    ]
  }
}
```

**Options:**
- `enabled`: Enable sandboxing
- `allowedPaths`: Filesystem access paths
- `networkAccess`: `full` | `restricted` | `none`
- `allowedDomains`: Whitelisted domains

### Memory Management

Control how gemini remembers context:

```json
{
  "memory": {
    "enabled": true,
    "location": "project",
    "ttl": 86400
  }
}
```

**location options:**
- `global`: Share memory across all projects
- `project`: Project-specific memory
- `none`: Disable memory

**ttl**: Time to live in seconds (default: 86400 = 24 hours)

### Output Styles

Customize gemini's behavior:

```json
{
  "outputStyle": "technical-writer"
}
```

**Built-in styles:**
- `default`: Standard coding assistant
- `technical-writer`: Documentation focus
- `code-reviewer`: Review-focused
- `minimal`: Concise responses

### Logging

Configure logging behavior:

```json
{
  "logging": {
    "level": "info",
    "file": ".gemini/logs/session.log",
    "console": true
  }
}
```

**Levels:** `debug`, `info`, `warn`, `error`

## Model Configuration

### Using Model Aliases

```bash
# Use flash (default)
gemini

# Use pro for complex task
gemini --model pro "architect a microservices system"

# Use flash-lite for speed
gemini --model flash-lite "fix typo in README"

# Use proplan for planning
gemini --model proplan "plan authentication system"
```

### In Settings File

```json
{
  "model": "pro",
  "thinking": {
    "enabled": true,
    "budget": 20000
  }
}
```

### Model Selection Guide

**flash** (gemini-flash-4-5-20250929):
- Balanced performance and cost
- Default choice for most tasks
- Good for general development

**pro** (gemini-pro-4-20250514):
- Highest capability
- Complex reasoning and planning
- Use for architecture, design, complex debugging

**flash-lite** (gemini-flash-lite-4-20250408):
- Fastest, most cost-effective
- Simple tasks (typos, formatting)
- High-volume operations

**proplan**:
- pro + extended thinking
- Deep planning and analysis
- Architecture decisions

## Output Styles

### Creating Custom Output Style

Create `~/.gemini/output-styles/my-style.md`:

```markdown
You are a senior software architect focused on scalability.

Guidelines:
- Prioritize performance and scalability
- Consider distributed systems patterns
- Include monitoring and observability
- Think about failure modes
- Document trade-offs
```

### Using Custom Output Style

```bash
gemini --output-style my-style
```

Or in settings:
```json
{
  "outputStyle": "my-style"
}
```

### Example Output Styles

**technical-writer.md:**
```markdown
You are a technical writer creating clear documentation.

Guidelines:
- Use simple, clear language
- Provide examples
- Structure with headings
- Include diagrams when helpful
- Focus on user understanding
```

**code-reviewer.md:**
```markdown
You are a senior code reviewer.

Guidelines:
- Check for bugs and edge cases
- Review security vulnerabilities
- Assess performance implications
- Verify test coverage
- Suggest improvements
```

## Environment Variables

### API Configuration
```bash
export google_API_KEY=sk-ant-xxxxx
export google_BASE_URL=https://api.google.com
```

### Proxy Configuration
```bash
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080
export NO_PROXY=localhost,127.0.0.1
```

### Custom CA Certificates
```bash
export NODE_EXTRA_CA_CERTS=/path/to/ca-bundle.crt
```

### Debug Mode
```bash
export gemini_DEBUG=1
export gemini_LOG_LEVEL=debug
```

## Command-Line Flags

### Common Flags

```bash
# Set model
gemini --model pro

# Set max tokens
gemini --max-tokens 16384

# Set temperature
gemini --temperature 0.8

# Enable debug mode
gemini --debug

# Use specific output style
gemini --output-style technical-writer

# Disable memory
gemini --no-memory

# Set project directory
gemini --project /path/to/project
```

### Configuration Commands

```bash
# View current settings
gemini config list

# Set global setting
gemini config set model pro

# Set project setting
gemini config set --project maxTokens 4096

# Get specific setting
gemini config get model

# Reset to defaults
gemini config reset
```

## Advanced Configuration

### Custom Tools

Register custom tools:

```json
{
  "tools": [
    {
      "name": "custom-tool",
      "description": "Custom tool",
      "command": "./scripts/custom-tool.sh",
      "parameters": {
        "arg1": "string"
      }
    }
  ]
}
```

### Rate Limiting

Configure rate limits:

```json
{
  "rateLimits": {
    "requestsPerMinute": 100,
    "tokensPerMinute": 100000,
    "retryStrategy": "exponential"
  }
}
```

### Caching

Prompt caching configuration:

```json
{
  "caching": {
    "enabled": true,
    "ttl": 3600,
    "maxSize": "100MB"
  }
}
```

## Best Practices

### Project Settings
- Keep project-specific in `.gemini/settings.json`
- Commit to version control
- Document custom settings
- Share with team

### Global Settings
- Personal preferences only
- Don't override project settings unnecessarily
- Use for API keys and auth

### Security
- Never commit API keys
- Use environment variables for secrets
- Enable sandboxing in production
- Restrict network access

### Performance
- Use appropriate model for task
- Set reasonable token limits
- Enable caching
- Configure rate limits

## Troubleshooting

### Settings Not Applied
```bash
# Check settings hierarchy
gemini config list --all

# Verify settings file syntax
cat .gemini/settings.json | jq .

# Reset to defaults
gemini config reset
```

### Environment Variables Not Recognized
```bash
# Verify export
echo $google_API_KEY

# Check shell profile
cat ~/.bashrc | grep google

# Reload shell
source ~/.bashrc
```

## See Also

- Model selection: https://docs.gemini.com/about-gemini/models
- Output styles: `references/best-practices.md`
- Security: `references/enterprise-features.md`
- Troubleshooting: `references/troubleshooting.md`
