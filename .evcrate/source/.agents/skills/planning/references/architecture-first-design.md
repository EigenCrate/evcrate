# Architecture-First Design Process

## Overview

Before planning or writing code, check if the project has an architecture document and apply the two-gate workflow:

```
Request → [GATE 1: Design] → Plan & Code → [GATE 2: Post-impl review]
```

## Gate 1 — Design Phase (before planning or coding)

### Step 1: Locate the architecture doc

Check in priority order:
1. `docs/architecture.md` (preferred convention)
2. `ARCHITECTURE.md` at project root
3. Any file referenced in `AGENTS.md` under "Architecture Reference"

If no architecture doc exists, skip to solution design — but flag it as a gap.

### Step 2: Read and internalize

- Read the full doc before designing anything
- Focus on: state machines, data flow, schema contracts, invariants/anti-patterns
- Note which sections are relevant to the current task

### Step 3: Update the architecture doc to reflect the intended design

Update relevant sections **before writing the plan** — architecture is the design surface, not a trailing artifact.

| Designing... | Update section |
|---|---|
| New DB table or field | Schema Contracts / Data Models |
| New service, adapter, or factory registration | ServiceFactory + Dataflow diagram |
| New UI flow or page | App-Level State Machine + Component Dataflow |
| Auth or token behavior change | Auth State Machine |
| Practice / quiz behavior change | Practice Session State Machine |
| Sync table order, lock name, conflict strategy | Sync State Machine + Sync Sequence |
| New rule, constraint, or anti-pattern | Key Invariants & Anti-Patterns |

**When updating Mermaid diagrams — activate the `mermaidjs-v11` skill** for correct syntax and diagram type selection. Key types used in architecture docs:
- `stateDiagram-v2` — state machines (app, auth, practice, sync lifecycles)
- `flowchart TD/LR` — component dataflow, system overview
- `sequenceDiagram` — actor interaction flows (add vocab, sync cycle, practice session)
- `classDiagram` — data models and schema contracts

### Step 4: Review before proceeding

Before writing the plan, answer:
- Does the design violate any listed invariant? → Redesign if yes
- Does it introduce coupling not in the dataflow? → Add it
- Are new schema fields present with correct sync column conventions? → Fix if missing
- Does the state machine cover all states and transitions? → Extend if incomplete

Only after this review → write the implementation plan.

## Gate 2 — Post-implementation Review (after code is done)

### Step 1: Diff implementation vs architecture doc

Check each section touched in Gate 1:
- Did implementation match the design exactly?
- Were there surprises (new states, extra calls, different field names)?

### Step 2: Patch divergences

- **Intended drift** (design evolved during impl) → update doc to match code
- **Unintended drift** (impl deviated without reason) → fix code, not doc

Use `mermaidjs-v11` skill to correctly update any diagrams that changed.

Also check:
- §Invariants: add any newly discovered rules or anti-patterns
- Sequence diagrams: update if actual call order differed from design

### Step 3: Confirm accuracy

The architecture doc must accurately describe the live codebase after every task. An outdated doc misleads future implementors.

## When to Skip Gate 1

- Pure bug fixes with no behavioral or structural change
- Copy/text-only changes
- Style/CSS changes with no component structure change
- Test-only changes
