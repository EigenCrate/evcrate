# Project Documentation Management

### Roadmap & Changelog Maintenance
- **Project Roadmap** (`./docs/development-roadmap.md`): Living document tracking project phases, milestones, and progress
- **Project Changelog** (`./docs/project-changelog.md`): Detailed record of all significant changes, features, and fixes
- **System Architecture** (`./docs/system-architecture.md`): Detailed record of all significant changes, features, and fixes
- **Code Standards** (`./docs/code-standards.md`): Detailed record of all significant changes, features, and fixes

### Automatic Updates Required
- **After Feature Implementation**: Update roadmap progress status and changelog entries
- **After Major Milestones**: Review and adjust roadmap phases, update success metrics
- **After Bug Fixes**: Document fixes in changelog with severity and impact
- **After Security Updates**: Record security improvements and version updates
- **Weekly Reviews**: Update progress percentages and milestone statuses

### Documentation Triggers
The `project-manager` agent MUST update these documents (for unsealed, authorized deliverables) when:
- A development phase status changes (e.g., from "In Progress" to "Complete")
- Major features are implemented or released
- Significant bugs are resolved or security patches applied
- Project timeline or scope adjustments are made
- External dependencies or breaking changes occur
*(Note: For advice-controlled plans or sealed phases, never direct edits to roadmap or metadata after seal; updates must be reconciled by the parent orchestrator within authorized scope before seal.)*
### Update Protocol
1. **Before Updates**: Always read current roadmap and changelog status
2. **During Updates**: Maintain version consistency and proper formatting
3. **After Updates**: Verify links, dates, and cross-references are accurate
4. **Quality Check**: Ensure updates align with actual implementation progress

### Plans

### Plan Location
Save plans in `./plans` directory with timestamp and descriptive name.

**Format:** Use naming pattern from `## Naming` section injected by hooks.

**Example:** `plans/251101-1505-authentication-and-profile-implementation/`

#### File Organization

```
plans/
├── 20251101-1505-authentication-and-profile-implementation/
    ├── research/
    │   ├── researcher-XX-report.md
    │   └── ...
│   ├── reports/
│   │   ├── scout-report.md
│   │   ├── researcher-report.md
│   │   └── ...
│   ├── plan.md                                # Overview access point
│   ├── phase-01-setup-environment.md          # Setup environment
│   ├── phase-02-implement-database.md         # Database models
│   ├── phase-03-implement-api-endpoints.md    # API endpoints
│   ├── phase-04-implement-ui-components.md    # UI components
│   ├── phase-05-implement-authentication.md   # Auth & authorization
│   ├── phase-06-implement-profile.md          # Profile page
│   └── phase-07-write-tests.md                # Tests
└── ...
```

#### File Structure

##### Overview Plan (plan.md)
- Keep generic and under 80 lines
- List each phase with status/progress
- Link to detailed phase files
- Key dependencies
- **Plan progress & reconciliation**: For advice-controlled plans (explicit `--advice`, applicable active advice run, or named checkpoint) and plans with preserved historical snapshots, follow [Plan progress and phase reconciliation](./advisor-mentoring.md#plan-progress-and-phase-reconciliation):
  - Sealed `plan.md`, phase files, and historical baseline paths remain strictly immutable even if subsequent commands omit `--advice`. Never edit sealed `plan.md` in place.
  - Live overview is maintained in `<plan-dir>/progress.md` (derived, uncaptured, outside baseline; never captured or cited as evidence/authorized substantive paths; if already captured, cannot overwrite progress, surface blocker).
  - New plans link `progress.md` before capture; for already sealed plans, startup and final output identify the overview without editing `plan.md`.
  - Parent plan-owning completion publishes mandatory outside-snapshot immutable phase completion receipts and updates `progress.md` upon completion per [Plan progress and phase reconciliation](./advisor-mentoring.md#plan-progress-and-phase-reconciliation). Do not execute Git commands or captured-file/selected-index mutations after seal; only bounded administrative receipt and progress publication outside baseline is permitted.
  - Normal plans without advice involvement keep normal `plan.md` status updates and do not require nonexistent progress links; prior sealed paths remain immutable, while current-run registered pre-seal writes within parent-authorized paths remain permitted.
##### Phase Files (phase-XX-name.md)
Fully respect the `./.evcrate-vscode/evcrate/workflows/development-rules.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/development-rules.md` (the published install) file.
Each phase file should contain:

**Context Links**
- Links to related reports, files, documentation

**Overview**
- Priority
- Current status
- Brief description

**Key Insights**
- Important findings from research
- Critical considerations

**Requirements**
- Functional requirements
- Non-functional requirements

**Architecture**
- System design
- Component interactions
- Data flow

**Related Code Files**
- List of files to modify
- List of files to create
- List of files to delete

**Implementation Steps**
- Detailed, numbered steps
- Specific instructions

**Todo List**
- Checkbox list for tracking

**Success Criteria**
- Definition of done
- Validation methods

**Risk Assessment**
- Potential issues
- Mitigation strategies

**Security Considerations**
- Auth/authorization
- Data protection

**Next Steps**
- Dependencies
- Follow-up tasks