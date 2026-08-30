# Getting Started with GitHub Copilot CLI

Installation, authentication, and setup guide for GitHub Copilot CLI.

## What is GitHub Copilot CLI?

GitHub Copilot CLI is GitHub's agentic coding tool that lives in the terminal and helps turn ideas into code faster. Key features:

- **Agentic Capabilities**: Autonomous planning, execution, and validation
- **Terminal Integration**: Works directly in command line
- **IDE Support**: Extensions for VS Code and JetBrains IDEs
- **Extensibility**: Plugins, skills, slash commands, and MCP servers
- **Enterprise Ready**: SSO, sandboxing, monitoring, and compliance features

## Prerequisites

### System Requirements
- **Operating Systems**: macOS, Linux, or Windows (WSL2)
- **Runtime**: Node.js 18+ or Python 3.10+
- **API Key**: From GitHub Console (console.anthropic.com)

### Getting API Key
1. Go to console.anthropic.com
2. Sign in or create account
3. Navigate to API Keys section
4. Generate new API key
5. Save key securely (cannot be viewed again)

## Installation

### Install via npm (Recommended)
```bash
npm install -g @anthropic-ai/copilot-cli
```

### Install via pip
```bash
pip install copilot-cli
```

### Verify Installation
```bash
copilot --version
```

## Authentication

### Method 1: Interactive Login
```bash
copilot login
# Follow prompts to enter API key
```

### Method 2: Environment Variable
```bash
# Add to ~/.bashrc or ~/.zshrc
export ANTHROPIC_API_KEY=your_api_key_here

# Or set for single session
export ANTHROPIC_API_KEY=your_api_key_here
copilot
```

### Method 3: Configuration File
Create `~/.copilot/config.json`:
```json
{
  "apiKey": "your_api_key_here"
}
```

### Verify Authentication
```bash
copilot "hello"
# Should respond without authentication errors
```

## First Run

### Start Interactive Session
```bash
# In any directory
copilot

# In specific project
cd /path/to/project
copilot
```

### Run with Specific Task
```bash
copilot "implement user authentication"
```

### Run with File Context
```bash
copilot "explain this code" --file app.js
```

## Basic Usage

### Interactive Mode
```bash
$ copilot
GitHub Copilot CLI> help me create a React component
# Copilot will plan and execute
```

### One-Shot Mode
```bash
copilot "add error handling to main.py"
```

### With Additional Context
```bash
copilot "refactor this function" --file utils.js --context "make it async"
```

## Understanding the Interface

### Session Start
```
GitHub Copilot CLI v1.x.x
Working directory: /path/to/project
Model: copilot-sonnet-4-5-20250929

GitHub Copilot CLI>
```

### Tool Execution
Copilot will show:
- Tool being used (Read, Write, Bash, etc.)
- Tool parameters
- Results or outputs
- Thinking/planning process (if enabled)

### Session End
```bash
# Type Ctrl+C or Ctrl+D
# Or type 'exit' or 'quit'
```

## Common First Commands

### Explore Codebase
```bash
copilot "explain the project structure"
```

### Run Tests
```bash
copilot "run the test suite"
```

### Fix Issues
```bash
copilot "fix all TypeScript errors"
```

### Add Feature
```bash
copilot "add input validation to the login form"
```

## Directory Structure

GitHub Copilot CLI creates `.copilot/` in your project:

```
project/
├── .copilot/
│   ├── settings.json      # Project-specific settings
│   ├── commands/          # Custom slash commands
│   ├── skills/            # Custom skills
│   ├── hooks.json         # Hook configurations
│   └── mcp.json           # MCP server configurations
└── ...
```

## Next Steps

### Learn Slash Commands
```bash
# See available commands
/help

# Try common workflows
/evcrate-cmd-cook implement feature X
/evcrate-cmd-fix-fast bug in Y
/evcrate-cmd-test
```

### Create Custom Skills
See `references/agent-skills.md` for creating project-specific skills.

### Configure MCP Servers
See `references/mcp-integration.md` for connecting external tools.

### Set Up Hooks
See `references/hooks-and-plugins.md` for automation.

### Configure Settings
See `references/configuration.md` for customization options.

## Quick Troubleshooting

### Authentication Issues
```bash
# Re-login
copilot logout
copilot login

# Verify API key is set
echo $ANTHROPIC_API_KEY
```

### Permission Errors
```bash
# Check file permissions
ls -la ~/.copilot

# Fix ownership
sudo chown -R $USER ~/.copilot
```

### Installation Issues
```bash
# Clear npm cache
npm cache clean --force

# Reinstall
npm uninstall -g @anthropic-ai/copilot-cli
npm install -g @anthropic-ai/copilot-cli
```

### WSL2 Issues (Windows)
```bash
# Ensure WSL2 is updated
wsl --update

# Check Node.js version in WSL
node --version  # Should be 18+
```

## Getting Help

- **Documentation**: https://docs.claude.com/claude-code
- **GitHub Issues**: https://github.com/anthropics/claude-code/issues
- **Support**: support.copilot.com
- **Community**: discord.gg/anthropic

For detailed troubleshooting, see `references/troubleshooting.md`.
