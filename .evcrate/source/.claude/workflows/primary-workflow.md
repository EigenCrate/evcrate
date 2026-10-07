# Primary Workflow

**IMPORTANT:** Analyze the skills catalog and activate the skills that are needed for the task during the process.
**IMPORTANT**: Ensure token efficiency while maintaining high quality.

**Subagent gate:** Every delegated step is blocking. Wait for the delegated agent's terminal response, verify the requested report/artifact, and only then proceed. For parallel steps, wait for all agents and require one result per agent; interrupted or partial work does not satisfy the gate. A no-completion poll is non-terminal: repeat the native wait on the same agent set.

#### 1. Code Implementation
- Before you start, delegate to `evc-planner` agent to create an implementation plan with TODO tasks in `./plans` directory, then wait for and verify its terminal report.
- When in planning phase, use multiple `evc-researcher` agents in parallel to conduct research on different relevant technical topics; wait for all reports before passing the complete set to `evc-planner`.
- Write clean, readable, and maintainable code
- Follow established architectural patterns
- Implement features according to specifications
- Handle edge cases and error scenarios
- **DO NOT** create new enhanced files, update to the existing files directly.
- **[IMPORTANT]** After creating or modifying code file, run compile command/script to check for any compile errors.

#### 2. Testing
- Delegate to `evc-tester` agent to run tests and analyze the summary report; wait for its terminal result before interpreting the gate.
  - Write comprehensive unit tests
  - Ensure high code coverage
  - Test error scenarios
  - Validate performance requirements
- Tests are critical for ensuring code quality and reliability, **DO NOT** ignore failing tests just to pass the build or github actions.
- **IMPORTANT:** make sure you don't use fake data, mocks, cheats, tricks, temporary solutions, just to pass the build or github actions.
- **IMPORTANT:** Always fix failing tests following the recommendations, wait for the fix, then delegate to `evc-tester` again and wait for a fresh result; only finish when all tests pass.

#### 3. Code Quality
- When executing under a supported activation command entrypoint (`code`, `cook`, `bootstrap`, `fix` families), resolve `ADVICE_MODE` and exact `WORK_ARGUMENTS` through [Advice activation](./advice-activation.md) before discovery or delegation; preserve already resolved context instead of universally demanding a new helper request. Other workflows, plain tasks, and `/evc-cmd-plan` retain ordinary off behavior without inventing a command identity, unless deliberately delegated through a supported command with structured context. Never infer activation from history, checkpoints or blockers; routers pass its structured direct-caller handoff, not an appended flag.
- After implementation, wait for one terminal `evc-code-reviewer` result and the command's normal approval gate. Off mode does not load full mentoring or call hard lifecycle/inference.
- Only resolved explicit/inherited mode loads [Caller lifecycle binding](./advisor-mentoring.md#caller-lifecycle-binding) and uses the canonical checkpoint dispatcher at authorized review/decision/stuck locations. Fresh init follows the implementation/validation/reviewer writer barrier; same-run context retains registered actions, revisions and prior counsel without duplication. Parent alone owns state.
- In that activated lifecycle, register accepted bounded work before writes, run actual declared validation and record matching truthful outcomes. Disputed counsel without an active action uses read-only evidence and fresh same-run counsel before correction. All substantive finalization and selected Git transitions settle before final outcome/seal; review caps or chat approval never bypass durable human gates.
- In every mode, apply neutral [Plan progress and phase reconciliation](./plan-progress.md) before phase selection, dependency batches and automatic iterations. Completed scope is a no-op, unresolved affected scope pauses without automatic resume/substitution, and prior sealed paths/index identities remain protected. Only parent publishes immutable receipts and uncaptured derived progress.
- On a second consecutive matching terminal blocker without a gate pass/step advance, off mode uses ordinary debugger/user escalation before another attempt; no hard stuck checkpoint. Risky/destructive decisions still require normal approval. Explicit/inherited mode retains the authorized stuck threshold and same-run lifecycle.
- Follow coding standards and conventions
- Write self-documenting code
- Add meaningful comments for complex logic
- Optimize for performance and maintainability

#### 4. Integration
- Always follow the plan given by `evc-planner` agent
- Ensure seamless integration with existing code
- Follow API contracts precisely
- Maintain backward compatibility
- Document breaking changes
- Delegate to `evc-docs-manager` agent to update docs in `./docs` directory if needed, then wait for and verify its report.

#### 5. Debugging
- When a user reports bugs or issues on the server or a CI/CD pipeline, delegate to `evc-debugger` agent and wait for its root-cause report.
- Read and verify the complete `evc-debugger` report before implementing the fix.
- Delegate to `evc-tester` agent and wait for its complete validation report.
- If the `evc-tester` agent reports failed tests, fix them following the recommendations, wait for the fix, then delegate to `evc-tester` again and wait for a fresh result; only finish when all tests pass.
