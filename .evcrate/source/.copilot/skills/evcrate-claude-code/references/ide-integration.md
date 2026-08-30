# IDE Integration

Use GitHub Copilot CLI with Visual Studio Code and JetBrains IDEs.

## Visual Studio Code

### Installation

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "GitHub Copilot CLI"
4. Click Install
5. Authenticate with API key

### Features

**Inline Chat**
- Press Ctrl+I (Cmd+I on Mac)
- Ask questions about code
- Get suggestions in context
- Apply changes directly

**Code Actions**
- Right-click on code
- Select "Ask Copilot"
- Get refactoring suggestions
- Fix bugs and issues

**Diff View**
- See proposed changes
- Accept/reject modifications
- Review before applying
- Staged diff comparison

**Terminal Integration**
- Built-in Copilot terminal
- Run commands via Copilot
- Execute tools directly
- View real-time output

### Configuration

**.vscode/settings.json:**
```json
{
  "copilot.apiKey": "${ANTHROPIC_API_KEY}",
  "copilot.model": "copilot-sonnet-4-5-20250929",
  "copilot.maxTokens": 8192,
  "copilot.autoSave": true,
  "copilot.inlineChat.enabled": true,
  "copilot.terminalIntegration": true
}
```

### Keyboard Shortcuts

**Default shortcuts:**
- `Ctrl+I`: Inline chat
- `Ctrl+Shift+C`: Open Copilot panel
- `Ctrl+Shift+Enter`: Submit to Copilot
- `Escape`: Close Copilot chat

**Custom shortcuts (.vscode/keybindings.json):**
```json
[
  {
    "key": "ctrl+alt+c",
    "command": "copilot.openChat"
  },
  {
    "key": "ctrl+alt+r",
    "command": "copilot.refactor"
  }
]
```

### Workspace Integration

**Project-specific Copilot settings:**

.vscode/copilot.json:
```json
{
  "skills": [".copilot/skills/project-skill"],
  "commands": [".copilot/commands"],
  "mcpServers": ".copilot/mcp.json",
  "outputStyle": "technical-writer"
}
```

### Common Workflows

**Explain Code:**
1. Select code
2. Right-click → "Ask Copilot"
3. Type: "Explain this code"

**Refactor:**
1. Select function
2. Press Ctrl+I
3. Type: "Refactor for better performance"

**Fix Bug:**
1. Click on error
2. Press Ctrl+I
3. Type: "Fix this error"

**Generate Tests:**
1. Select function
2. Right-click → "Ask Copilot"
3. Type: "Write tests for this"

## JetBrains IDEs

Supported IDEs:
- IntelliJ IDEA
- PyCharm
- WebStorm
- PhpStorm
- GoLand
- RubyMine
- CLion
- Rider

### Installation

1. Open Settings (Ctrl+Alt+S)
2. Go to Plugins
3. Search "GitHub Copilot CLI"
4. Click Install
5. Restart IDE
6. Authenticate with API key

### Features

**AI Assistant Panel**
- Dedicated Copilot panel
- Context-aware suggestions
- Multi-file awareness
- Project understanding

**Inline Suggestions**
- As-you-type completions
- Contextual code generation
- Smart refactoring hints
- Error fix suggestions

**Code Reviews**
- Automated code reviews
- Security vulnerability detection
- Best practice recommendations
- Performance optimization tips

**Refactoring Support**
- Smart rename
- Extract method
- Inline variable
- Move class

### Configuration

**Settings → Tools → Copilot Code:**
```
API Key: [Your API Key]
Model: copilot-sonnet-4-5-20250929
Max Tokens: 8192
Auto-complete: Enabled
Code Review: Enabled
```

**Project Settings (.idea/copilot.xml):**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="CopilotSettings">
    <option name="model" value="copilot-sonnet-4-5-20250929" />
    <option name="skillsPath" value=".copilot/skills" />
    <option name="autoReview" value="true" />
  </component>
</project>
```

### Keyboard Shortcuts

**Default shortcuts:**
- `Ctrl+Shift+A`: Ask Copilot
- `Alt+Enter`: Quick fixes with Copilot
- `Ctrl+Alt+L`: Format with Copilot suggestions

**Custom shortcuts (Settings → Keymap → GitHub Copilot CLI):**
```
Ask Copilot: Ctrl+Shift+C
Refactor with Copilot: Ctrl+Alt+R
Generate Tests: Ctrl+Alt+T
Code Review: Ctrl+Alt+V
```

### Integration with IDE Features

**Version Control:**
- Review commit diffs with Copilot
- Generate commit messages
- Suggest PR improvements
- Analyze merge conflicts

**Debugger:**
- Explain stack traces
- Suggest fixes for errors
- Debug complex issues
- Analyze variable states

**Database Tools:**
- Generate SQL queries
- Optimize database schema
- Write migration scripts
- Explain query plans

### Common Workflows

**Generate Boilerplate:**
1. Right-click in editor
2. Select "Generate" → "GitHub Copilot CLI"
3. Choose template type

**Review Changes:**
1. Open Version Control panel
2. Right-click on changeset
3. Select "Review with Copilot"

**Debug Error:**
1. Hit breakpoint
2. Right-click in debugger
3. Select "Ask Copilot about this"

## CLI Integration

Use GitHub Copilot CLI from IDE terminal:

```bash
# In VS Code terminal
copilot "explain this project structure"

# In JetBrains terminal
copilot "add error handling to current file"
```

## Best Practices

### VS Code

**Workspace Organization:**
- Use workspace settings for team consistency
- Share .vscode/copilot.json in version control
- Document custom shortcuts
- Configure output styles per project

**Performance:**
- Limit inline suggestions in large files
- Disable auto-save for better control
- Use specific prompts
- Close unused editor tabs

### JetBrains

**Project Configuration:**
- Enable Copilot for specific file types only
- Configure inspection severity
- Set up custom code review templates
- Use project-specific skills

**Performance:**
- Adjust auto-complete delay
- Limit scope of code analysis
- Disable for binary files
- Configure memory settings

## Troubleshooting

### VS Code

**Extension Not Loading:**
```bash
# Check extension status
code --list-extensions | grep copilot

# Reinstall
code --uninstall-extension anthropic.copilot-cli
code --install-extension anthropic.copilot-cli
```

**Authentication Issues:**
- Verify API key in settings
- Check environment variable
- Re-authenticate in extension
- Review proxy settings

### JetBrains

**Plugin Not Responding:**
```
File → Invalidate Caches / Restart
Settings → Plugins → GitHub Copilot CLI → Reinstall
```

**Performance Issues:**
- Increase IDE memory (Help → Edit Custom VM Options)
- Disable unused features
- Clear caches
- Update plugin version

## See Also

- VS Code extension: https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code
- JetBrains plugin: https://plugins.jetbrains.com/plugin/claude-code
- Configuration: `references/configuration.md`
- Troubleshooting: `references/troubleshooting.md`
