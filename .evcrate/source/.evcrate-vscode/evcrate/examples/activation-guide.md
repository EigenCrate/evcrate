# EVCrate VS Code Local Plugin — Activation and Configuration Guide

This guide explains how to inspect, register, activate, and manage the **EVCrate Local** Agent Plugin bundle for Visual Studio Code.

---

## 1. Safety and Boundary Principles

1. **Inert by Default**: The published plugin bundle at `.evcrate-vscode/` is entirely inert upon publication. EVCrate does NOT write to user profile databases, editor settings files (`~/.config/Code/User/settings.json`), or workspace `.vscode/` settings.
2. **Explicit Activation**: Enabling the plugin requires deliberate manual user selection via `chat.pluginLocations`.
3. **Workspace Trust Required**: Agent plugins and lifecycle hooks execute within the VS Code Extension Host. They require a trusted workspace.
4. **No Plaintext Secrets**: MCP server configurations and credentials must NEVER be placed in tracked workspace files or plaintext arguments.

---

## 2. Prerequisites

Verify that your environment meets the following requirements before activation:

1. **VS Code Released Build**: Version 1.140.0 or later with GitHub Copilot Chat extension installed and operational.
2. **Node.js**: Node.js runtime (v20+ recommended) must be available on your system `PATH` for hook script execution.
3. **Core Settings Enabled**:
   Open VS Code User or Workspace Settings (`settings.json`) and ensure:
   ```json
   {
     "chat.plugins.enabled": true,
     "chat.useHooks": true
   }
   ```

---

## 3. Manual Activation

To activate EVCrate Local:

1. Determine the absolute path to your installed `.evcrate-vscode` bundle:
   - For **Project scope**: `/path/to/your-project/.evcrate-vscode`
   - For **HOME scope**: `/home/username/.evcrate-vscode`
2. Open your VS Code Settings (`settings.json`) and add your installation path to `chat.pluginLocations`, setting its value to `true`:
   ```json
   {
     "chat.pluginLocations": {
       "/path/to/your-project/.evcrate-vscode": true
     }
   }
   ```
3. Reload or restart VS Code. The EVCrate skills (`/evc:cmd-*`), bootstrap instructions, and lifecycle hooks will now be active in Copilot Chat Local mode.

**Important Notice on Agent Templates**: Agent actors (`@evc-*`) are published as immutable templates in `evcrate/agent-templates/` (intended layout outside host-discovered static agent directories, subject to Phase 09 live discovery qualification). Plugin registration alone activates skills, instructions, and hooks, but does not activate agents. Agent contribution requires the private companion extension and runtime model bindings.

---

## 4. Companion Extension and Runtime Model Bindings Architecture

Agent actors (`@evc-*`) are authored as immutable templates in `evcrate/agent-templates/` and require the private companion extension (`eigencrate.evcrate-model-bindings`) for runtime model resolution:

- **Companion Packaging & Installation**: The private companion extension (`eigencrate.evcrate-model-bindings`) is packaged and verified in the published VS Code output. You can install it using `evcrate publish --apply --target vscode --install-vscode-companion` (or interactively confirm the post-publish prompt).
- **Proposed API Enablement**: When the companion is deployed, activation requires launching VS Code with the proposed `chatPromptFiles` API flag:
   ```bash
   code --enable-proposed-api=eigencrate.evcrate-model-bindings
   ```
- **Runtime Enrollment & Model Selection**: Once the companion runtime is packaged, users will enroll their installation root and bind user-selected models to canonical tiers (`opus`, `sonnet`, `haiku`).
---

## 5. Deactivation and Uninstallation

To deactivate or remove EVCrate Local:

1. Change the registration entry in `chat.pluginLocations` from `true` to `false` (disables without removing), or remove the key entirely.
2. EVCrate publication and recovery tooling NEVER modifies your `settings.json`. Deactivation is completely under user control.

---

## 6. Opt-in MCP Server Configuration

EVCrate provides an example MCP server configuration in `evcrate/examples/mcp-servers.example.json`.

**Important**: Plugin `mcp.json` files can auto-start implicitly trusted servers. For security, EVCrate does NOT place an active `mcp.json` at the plugin root.

To opt in to MCP servers:
1. Review the servers in `evcrate/examples/mcp-servers.example.json`.
2. Copy only the desired server definitions into your active VS Code MCP configuration (e.g. User MCP or Workspace `.vscode/mcp.json`).
3. For servers requiring API keys (such as Context7), use input variables (e.g. `${input:context7ApiKey}`) rather than hardcoding tokens in arguments.

---

## 7. Project and Runtime Configuration

To customize project policies (such as documentation line limits, plan naming formats, and coding level guidance):
1. Review `evcrate/examples/evcrate-config.example.json`.
2. Copy it to your project root as `.evcrate.json` or inside `.evcrate-vscode/.evcrate.json`.
3. EVCrate lifecycle hooks read this configuration at session startup to provide project context.
