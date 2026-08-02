---
name: "advisor-strategy"
description: "Guide current-session reasoning for high-impact architecture, security, debugging, and review decisions with a bounded decision brief."
---

# Advisor strategy

Use this skill explicitly for high-impact architecture, security, debugging, or review decisions where a structured second look at the available evidence can reduce risk.

Do not use it for routine edits, straightforward lookups, status updates, tasks with enough local evidence, or repeated attempts to get a preferred answer.

## Scope

This is static guidance for the current session. It does not invoke a provider or model, MCP server, app, command, network request, file operation, delegation, quota, audit, or enforcement mechanism. It adds no tool capability, isolation boundary, fixed-model guarantee, or required consultation step. Host permissions, sandboxing, and human approval remain authoritative.

## Decision workflow

1. State the decision, constraints, and a precise question.
2. Identify only the smallest relevant repository evidence paths; do not include secrets, credentials, or unrelated files.
3. Form an independent recommendation from the available evidence and applicable requirements.
4. Compare alternatives, prefer the least complex safe option, and record why a material decision was accepted or rejected.

See [the brief contract](references/brief-contract.md) for the decision-brief shape and examples.
