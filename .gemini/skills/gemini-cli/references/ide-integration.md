# IDE Integration

Use gemini Code with Visual Studio Code and JetBrains IDEs.

## Visual Studio Code

### Installation

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "gemini Code"
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
- Select "Ask gemini"
- Get refactoring suggestions
- Fix bugs and issues

**Diff View**
- See proposed changes
- Accept/reject modifications
- Review before applying
- Staged diff comparison

**Terminal Integration**
- Built-in gemini terminal
- Run commands via gemini
- Execute tools directly
- View real-time output

### Configuration

**.vscode/settings.json:**
```json
{
  "gemini.apiKey": "${google_API_KEY}",
  "gemini.model": "gemini-flash-4-5-20250929",
  "gemini.maxTokens": 8192,
  "gemini.autoSave": true,
  "gemini.inlineChat.enabled": true,
  "gemini.terminalIntegration": true
}
```

### Keyboard Shortcuts

**Default shortcuts:**
- `Ctrl+I`: Inline chat
- `Ctrl+Shift+C`: Open gemini panel
- `Ctrl+Shift+Enter`: Submit to gemini
- `Escape`: Close gemini chat

**Custom shortcuts (.vscode/keybindings.json):**
```json
[
  {
    "key": "ctrl+alt+c",
    "command": "gemini.openChat"
  },
  {
    "key": "ctrl+alt+r",
    "command": "gemini.refactor"
  }
]
```

### Workspace Integration

**Project-specific gemini settings:**

.vscode/gemini.json:
```json
{
  "skills": [".gemini/skills/project-skill"],
  "commands": [".gemini/commands"],
  "mcpServers": ".gemini/mcp.json",
  "outputStyle": "technical-writer"
}
```

### Common Workflows

**Explain Code:**
1. Select code
2. Right-click → "Ask gemini"
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
2. Right-click → "Ask gemini"
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
3. Search "gemini Code"
4. Click Install
5. Restart IDE
6. Authenticate with API key

### Features

**AI Assistant Panel**
- Dedicated gemini panel
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

**Settings → Tools → gemini Code:**
```
API Key: [Your API Key]
Model: gemini-flash-4-5-20250929
Max Tokens: 8192
Auto-complete: Enabled
Code Review: Enabled
```

**Project Settings (.idea/gemini.xml):**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="geminiSettings">
    <option name="model" value="gemini-flash-4-5-20250929" />
    <option name="skillsPath" value=".gemini/skills" />
    <option name="autoReview" value="true" />
  </component>
</project>
```

### Keyboard Shortcuts

**Default shortcuts:**
- `Ctrl+Shift+A`: Ask gemini
- `Alt+Enter`: Quick fixes with gemini
- `Ctrl+Alt+L`: Format with gemini suggestions

**Custom shortcuts (Settings → Keymap → gemini Code):**
```
Ask gemini: Ctrl+Shift+C
Refactor with gemini: Ctrl+Alt+R
Generate Tests: Ctrl+Alt+T
Code Review: Ctrl+Alt+V
```

### Integration with IDE Features

**Version Control:**
- Review commit diffs with gemini
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
2. Select "Generate" → "gemini Code"
3. Choose template type

**Review Changes:**
1. Open Version Control panel
2. Right-click on changeset
3. Select "Review with gemini"

**Debug Error:**
1. Hit breakpoint
2. Right-click in debugger
3. Select "Ask gemini about this"

## CLI Integration

Use gemini Code from IDE terminal:

```bash
# In VS Code terminal
gemini "explain this project structure"

# In JetBrains terminal
gemini "add error handling to current file"
```

## Best Practices

### VS Code

**Workspace Organization:**
- Use workspace settings for team consistency
- Share .vscode/gemini.json in version control
- Document custom shortcuts
- Configure output styles per project

**Performance:**
- Limit inline suggestions in large files
- Disable auto-save for better control
- Use specific prompts
- Close unused editor tabs

### JetBrains

**Project Configuration:**
- Enable gemini for specific file types only
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
code --list-extensions | grep gemini

# Reinstall
code --uninstall-extension google.gemini-cli
code --install-extension google.gemini-cli
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
Settings → Plugins → gemini Code → Reinstall
```

**Performance Issues:**
- Increase IDE memory (Help → Edit Custom VM Options)
- Disable unused features
- Clear caches
- Update plugin version

## See Also

- VS Code extension: https://marketplace.visualstudio.com/items?itemName=google.gemini-cli
- JetBrains plugin: https://plugins.jetbrains.com/plugin/gemini-cli
- Configuration: `references/configuration.md`
- Troubleshooting: `references/troubleshooting.md`
