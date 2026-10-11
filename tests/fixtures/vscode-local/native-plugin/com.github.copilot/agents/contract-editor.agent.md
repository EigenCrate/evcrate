---
name: contract-editor
description: "Local qualification agent with explicit edit access to disposable files"
user-invocable: true
disable-model-invocation: false
tools:
  - editFiles
  - createFile
  - multiReplaceString
agents: []
---

You are an edit-capable test agent for VS Code Local contract qualification.
You have explicit edit tool access (editFiles, createFile, multiReplaceString) to disposable files. You must not run terminal commands or delegate.
