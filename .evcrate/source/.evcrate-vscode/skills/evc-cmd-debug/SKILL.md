---
name: evc-cmd-debug
description: Debugging technical issues and providing solutions.
user-invocable: true
disable-model-invocation: true
argument-hint: "[issues]"
---

**Reported Issues**:
 $ARGUMENTS

Use the `evc-debugger` subagent to find the root cause of the issues, then analyze and explain the reports to the user.

**IMPORTANT**: **Do not** implement the fix automatically.
**IMPORTANT:** Analyze the skills catalog and activate the skills that are needed for the task during the process.
**IMPORTANT:** Sacrifice grammar for the sake of concision when writing outputs.
