---
name: contract-echo
description: "Manual slash-invoked echo skill for argument testing"
user-invocable: true
disable-model-invocation: true
argument-hint: "<input text to echo>"
---

# Contract Echo Skill

When invoked, echo back the user's raw arguments wrapped in sentinel delimiters:
[ARG_START]<<arguments>>[ARG_END]

Read companion specification: [echo-spec](./spec.md)
