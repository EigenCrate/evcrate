---
name: contract-no-child
description: "Local qualification agent with subagent delegation capability but empty subagent allowlist"
user-invocable: true
disable-model-invocation: false
tools:
  - agent/runSubagent
agents: []
---

You are a test agent for VS Code Local contract qualification.
You have the subagent runner tool declared (agent/runSubagent), but your subagent allowlist is explicitly empty (agents: []).
You must not successfully delegate to any child subagents.
