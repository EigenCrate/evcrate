## Agent Orchestration Patterns

### Sequential Chaining
Use when tasks have dependencies:
```bash
# Planning → Implementation → Testing → Review
/plan "implement user dashboard"
# Wait for plan completion, then:
/cook "follow the implementation plan"
# After implementation:
/test "validate dashboard functionality"
# Finally:
/review "ensure code quality standards"
```

### Parallel Execution
Use for independent tasks:
```bash
# Multiple researchers exploring different approaches
planner agent spawns:
- researcher (database options)
- researcher (authentication methods)
- researcher (UI frameworks)
# All report back to planner simultaneously
```

### Context Management
- Agents communicate through file system reports
- Context is preserved between agent handoffs
- Fresh context prevents conversation degradation
- Essential information is documented in markdown

## Development Workflow

### 1. Feature Development
```bash
# Start with planning
/plan "add real-time notifications"

# Research phase (automatic)
# Multiple researcher agents investigate approaches

# Implementation
/cook "implement notification system"

# Quality assurance
/test
/review

# Documentation update
/docs

# Project tracking
/watzup  # Check project status
```

### 2. Bug Fixing
```bash
# Analyze the issue
/debug "investigate login failures"

# Create fix plan
/plan "resolve authentication bug"

# Implement solution
/fix "authentication issue"

# Validate fix
/test
```

### 3. Documentation Management
```bash
# Update documentation
/docs

# Generate codebase summary
repomix  # Creates ./docs/codebase-summary.md

# Review project status
/watzup
```

## Gemini Skills Configuration

This project includes several Gemini-powered skills that require a Google Gemini API key:

- **gemini-audio** - Audio analysis and speech generation
- **gemini-video-understanding** - Video analysis and understanding
- **gemini-document-processing** - PDF document processing
- **gemini-image-gen** - AI image generation
- **gemini-vision** - Image analysis and vision capabilities

### API Key Setup

The Gemini skills check for `GEMINI_API_KEY` in the following order (priority from highest to lowest):

1. **Environment Variable** (Recommended for development)
   ```bash
   export GEMINI_API_KEY='your-api-key-here'
   ```

2. **Project Root `.env`** (Recommended for project-specific keys)
   ```bash
   # Create .env in project root
   echo 'GEMINI_API_KEY=your-api-key-here' > .env
   ```

3. **`.claude/.env`** (For Claude-specific configuration)
   ```bash
   # Copy example and edit
   cp .claude/.env.example .claude/.env
   # Then edit .claude/.env and set your API key
   ```

4. **`.claude/skills/.env`** (For shared skills configuration)
   ```bash
   # Copy example and edit
   cp .claude/skills/.env.example .claude/skills/.env
   # Then edit .claude/skills/.env and set your API key
   ```

5. **Individual Skill Directory `.env`** (For skill-specific keys)
   ```bash
   # Example for gemini-audio skill
   cp .claude/skills/gemini-audio/.env.example .claude/skills/gemini-audio/.env
   # Then edit and set your API key
   ```

### Getting Your API Key

Get your free Gemini API key at: https://aistudio.google.com/apikey

### Vertex AI Support

To use Vertex AI instead of Google AI Studio:

```bash
# Enable Vertex AI
export GEMINI_USE_VERTEX=true
export VERTEX_PROJECT_ID=your-gcp-project-id
export VERTEX_LOCATION=us-central1  # Optional, defaults to us-central1
```

Or in `.env` file:
```
GEMINI_USE_VERTEX=true
VERTEX_PROJECT_ID=your-gcp-project-id
VERTEX_LOCATION=us-central1
```

## Best Practices

### Development Principles
- **YANGI**: You Aren't Gonna Need It - avoid over-engineering
- **KISS**: Keep It Simple, Stupid - prefer simple solutions
- **DRY**: Don't Repeat Yourself - eliminate code duplication

### Configuration & Baseline Management
- **Canonical Authoring**: Shared Claude Code configuration, hooks, workflows, commands, and skills are authored in `.claude/`. Target manifests/overlays in `.evcrate/targets/` are distribution metadata; `.agents/`, `.codex/`, `.gemini/`, and `.antigravity/` are generated outputs and must not be hand-edited.
- **Two Distribution Gates**: Run `python3 distribute.py --build` to regenerate local artifacts, `--check` to verify them without writes, and `--publish` to publish an existing verified build to HOME. After changing `.claude/`, use `python3 distribute.py --all` (or `--build` then `--publish`); `--publish` requires that verified build and never runs migrators.
- **HOME Publication**: The local `.claude` artifact remains complete, while HOME publication sanitizes `$HOME/.claude` by excluding regular files directly under `.claude/skills/` (installation/readme/notices/archives), retaining skill package directories and nested resources, and removing stale managed copies. The Pi-compatible `.agents/skills/` tree continues to publish to `$HOME/.agents/skills/`; unmanaged files remain preserved according to target policy.
- **Pi Skill Metadata**: Authored and generated Pi-distributed `SKILL.md` files require YAML frontmatter with a lower-kebab-case `name` and non-empty `description`. Generated command skills use `cmd_*` directories, lower-kebab-case frontmatter names, and descriptions no longer than 1,024 characters.
- **Pi Settings**: Pi discovers `$HOME/.agents/skills/` globally; publication does not create or modify `~/.pi/agent/settings.json`.
- **No Direct Downstream Edits**: Do not edit `.gemini/`, `.agents/`, or `.codex/` directly. They are generated automatically by the local build gate.
- **Emergency Global Migration Only**: Direct migrator `--global` modes are refused. For a documented recovery incident only, set `DEVKIT_ALLOW_DIRECT_GLOBAL=1`; it bypasses publication verification and emits a warning.
- **Legacy HOME Cleanup Window**: Managed publication retains the pre-manifest cleanup lists for this transition phase; manifest-scoped deletion and user-root preservation land in the Phase 3 publish gate.
- **Track Downstream Assets**: Generated folders (`.gemini/`, `.agents/`, `.codex/`) must be committed and tracked in Git to monitor compiled changes and prevent configuration regressions.

### Code Quality
- All code changes go through automated review
- Comprehensive testing is mandatory
- Security considerations are built-in
- Performance optimization is continuous

### Documentation
- Documentation evolves with code changes
- API docs are automatically updated
- Architecture decisions are recorded
- Codebase summaries are regularly refreshed

### Git Workflow
- Clean, conventional commit messages
- Professional git history
- No AI attribution in commits
- Focused, atomic commits

## Usage Examples

### Starting a New Feature
```bash
# Research and plan
claude "I need to implement user authentication with OAuth2"
# Planner agent creates comprehensive plan

# Follow the plan
claude "Implement the authentication plan"
# Implementation follows the detailed plan

# Ensure quality
claude "Review and test the authentication system"
# Testing and code review agents validate the implementation
```

### Debugging Issues
```bash
# Investigate problem
claude "Debug the slow database queries"
# Debugger agent analyzes logs and performance

# Create solution
claude "Optimize the identified query performance issues"
# Implementation follows debugging recommendations

# Validate fix
claude "Test query performance improvements"
# Tester agent validates the optimization
```

### Project Maintenance
```bash
# Check project health
claude "What's the current project status?"
# Project manager provides comprehensive status

# Update documentation
claude "Sync documentation with recent changes"
# Docs manager updates all relevant documentation

# Plan next sprint
claude "Plan the next development phase"
# Planner creates detailed roadmap for upcoming work
```


**Start building with AI-powered development today!** This boilerplate provides everything you need to create professional software with intelligent agent assistance.