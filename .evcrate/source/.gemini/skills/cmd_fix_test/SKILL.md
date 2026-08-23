---
name: cmd_fix_test
description: ⚡⚡ Run test suite and fix issues
---
# cmd_fix_test

Command Path: /fix/test

Description: ⚡⚡ Run test suite and fix issues

Analyze the skills catalog and activate the skills that are needed for the task during the process.

## Reported Issues:
<raw-issues>{{args}}</raw-issues>

## Advice Mode

A final standalone `--advice` activates explicit review mentoring.
Before testing, read `.gemini/workflows/advisor-mentoring.md` and derive
`WORK_ARGUMENTS` plus explicit/default advice mode. Use `WORK_ARGUMENTS` as the
issues input and apply the shared default stuck-escalation contract.

## Workflow:
1. Use `tester` subagent to compile the code and fix all syntax errors if any.
2. Use `tester` subagent to run the tests and report back to main agent.
3. If there are issues or failed tests, use `debugger` subagent to find the root cause of the issues, then report back to main agent.
4. Use `planner` subagent to create an implementation plan based on the reports, then report back to main agent.
5. Use main agent to implement the plan step by step.
6. Use `tester` agent to test the fix and make sure it works, then report back to main agent.
7. Use `code-reviewer` subagent to review the code changes and wait for its terminal report. In explicit advice mode, immediately follow it with exactly one blocking `advisor` call at `review:<workflow-step>` using the bounded evidence, prior counsel, and owner disposition from the shared mentoring contract; do not fix, approve, or report findings before the advisor terminal result. Review/advisor cycle cap: at most three terminal reviewer/advisor cycles; at the cap, stop without another review/advisor call or cycle reset, then ask the user if issues remain.
8. If there are issues or failed tests, repeat from step 2.
9. After finishing, respond back to user with a summary of the changes and explain everything briefly, guide user to get started and suggest the next steps.
