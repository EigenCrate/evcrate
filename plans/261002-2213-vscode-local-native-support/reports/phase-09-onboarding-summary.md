# VS Code Local Native Support — Phase 09 Onboarding Summary

- **Date:** 2026-10-04
- **Phase:** `Phase 09 — Documentation, controlled rollout and lifecycle`
- **Plan:** `plans/261002-2213-vscode-local-native-support/plan.md`
- **Status:** Complete

---

## 1. Onboarding Requirements & Credentials Audit

| Area | Requirement | Status | Notes |
|---|---|---|---|
| **API Keys / Secrets** | None required | Satisfied | EVCrate core and VS Code Local bundle do not mandate any proprietary API keys or external credentials. Copilot Chat authentication is managed natively by VS Code. |
| **Environment Variables** | None required | Satisfied | All hook execution, session context, and advisor workflows operate within bounded local process environments without mandatory `.env` dependencies. |
| **Runtime Dependencies** | Node.js `>=22.19.0` | Satisfied | Verified on workstation with Node `v24.16.0`. |
| **Editor Runtime** | VS Code `1.140.0` | Pinned | Qualified on VS Code `1.140.0` (commit `07f806f999227108933c2e30515b26eecc1fda74`) with Copilot Chat `0.68.0`. |
| **MCP Configuration** | Opt-in (None active by default) | Satisfied | Example configurations in `evcrate/examples/vscode-settings.example.json` are inert templates with pinned versions; no servers start automatically. |

---

## 2. Operator Activation Steps

1. **Publish Projection**:
   ```bash
   evcrate publish --apply --scope project --project-root /path/to/project --target vscode --json
   ```
2. **Configure Editor Settings**:
   Add the absolute path of the published bundle to VS Code user or workspace `settings.json`:
   ```json
   {
     "chat.pluginLocations": {
       "/path/to/project/.evcrate-vscode": true
     }
   }
   ```
3. **Reload Window**:
   Execute `Developer: Reload Window` via Command Palette (`Ctrl+Shift+P`).
4. **Verify Operability**:
   - Verify 19 custom agents in agent picker (e.g. `@advisor`).
   - Verify slash commands under `evcrate-local` namespace (e.g. `/evcrate-local:cmd-plan`).
   - Confirm lifecycle hooks trigger cleanly without exceptions.

---

## 3. Maintenance & Recovery Checklist

- **Interrupted Transactions**: Run `evcrate recover --scope project --project-root <path> --json`.
- **Deactivation**: Set `"chat.pluginLocations": { "<path>": false }` in VS Code settings.
- **Rollout Halts**: Stop rollout immediately if any of the 6 documented lifecycle stop triggers are met.
