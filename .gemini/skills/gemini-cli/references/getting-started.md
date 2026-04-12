# Getting Started with gemini Code

Installation, authentication, and setup guide for gemini Code.

## What is gemini Code?

gemini Code is google's agentic coding tool that lives in the terminal and helps turn ideas into code faster. Key features:

- **Agentic Capabilities**: Autonomous planning, execution, and validation
- **Terminal Integration**: Works directly in command line
- **IDE Support**: Extensions for VS Code and JetBrains IDEs
- **Extensibility**: Plugins, skills, slash commands, and MCP servers
- **Enterprise Ready**: SSO, sandboxing, monitoring, and compliance features

## Prerequisites

### System Requirements
- **Operating Systems**: macOS, Linux, or Windows (WSL2)
- **Runtime**: Node.js 18+ or Python 3.10+
- **API Key**: From google Console (console.google.com)

### Getting API Key
1. Go to console.google.com
2. Sign in or create account
3. Navigate to API Keys section
4. Generate new API key
5. Save key securely (cannot be viewed again)

## Installation

### Install via npm (Recommended)
```bash
npm install -g @google-ai/gemini-cli
```

### Install via pip
```bash
pip install gemini-cli
```

### Verify Installation
```bash
gemini --version
```

## Authentication

### Method 1: Interactive Login
```bash
gemini login
# Follow prompts to enter API key
```

### Method 2: Environment Variable
```bash
# Add to ~/.bashrc or ~/.zshrc
export google_API_KEY=your_api_key_here

# Or set for single session
export google_API_KEY=your_api_key_here
gemini
```

### Method 3: Configuration File
Create `~/.gemini/config.json`:
```json
{
  "apiKey": "your_api_key_here"
}
```

### Verify Authentication
```bash
gemini "hello"
# Should respond without authentication errors
```

## First Run

### Start Interactive Session
```bash
# In any directory
gemini

# In specific project
cd /path/to/project
gemini
```

### Run with Specific Task
```bash
gemini "implement user authentication"
```

### Run with File Context
```bash
gemini "explain this code" --file app.js
```

## Basic Usage

### Interactive Mode
```bash
$ gemini
gemini Code> help me create a React component
# gemini will plan and execute
```

### One-Shot Mode
```bash
gemini "add error handling to main.py"
```

### With Additional Context
```bash
gemini "refactor this function" --file utils.js --context "make it async"
```

## Understanding the Interface

### Session Start
```
gemini Code v1.x.x
Working directory: /path/to/project
Model: gemini-flash-4-5-20250929

gemini Code>
```

### Tool Execution
gemini will show:
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
gemini "explain the project structure"
```

### Run Tests
```bash
gemini "run the test suite"
```

### Fix Issues
```bash
gemini "fix all TypeScript errors"
```

### Add Feature
```bash
gemini "add input validation to the login form"
```

## Directory Structure

gemini Code creates `.gemini/` in your project:

```
project/
├── .gemini/
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
/cook implement feature X
/fix:fast bug in Y
/test
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
gemini logout
gemini login

# Verify API key is set
echo $google_API_KEY
```

### Permission Errors
```bash
# Check file permissions
ls -la ~/.gemini

# Fix ownership
sudo chown -R $USER ~/.gemini
```

### Installation Issues
```bash
# Clear npm cache
npm cache clean --force

# Reinstall
npm uninstall -g @google-ai/gemini-cli
npm install -g @google-ai/gemini-cli
```

### WSL2 Issues (Windows)
```bash
# Ensure WSL2 is updated
wsl --update

# Check Node.js version in WSL
node --version  # Should be 18+
```

## Getting Help

- **Documentation**: https://docs.gemini.com/gemini-cli
- **GitHub Issues**: https://github.com/googles/gemini-cli/issues
- **Support**: support.gemini.com
- **Community**: discord.gg/google

For detailed troubleshooting, see `references/troubleshooting.md`.
