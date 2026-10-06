# Slash Commands Reference

Comprehensive catalog of Claude Code slash commands for development workflows.

## What Are Slash Commands?

Slash commands are user-defined operations that:
- Start with `/` (e.g., `/cmd-cook`, `/cmd-test`)
- Expand to full prompts when executed
- Accept arguments
- Located in `.omp/evcrate/commands/`
- Can be project-specific or global

## Development Commands

### /cmd-cook [task]
Implement features step by step.

```bash
/cmd-cook implement user authentication with JWT
```

**When to use**: Feature implementation with iterative development

### /cmd-plan [task]
Research, analyze, and create implementation plans.

```bash
/cmd-plan implement OAuth2 authentication
/cmd-plan migrate from SQLite to PostgreSQL
```

**When to use**: Before starting complex implementations

### /cmd-debug [issue]
Debug technical issues and provide solutions.

```bash
/cmd-debug the API returns 500 errors intermittently
/cmd-debug authentication flow not working
```

**When to use**: Investigating and diagnosing problems

### /cmd-test
Run test suite.

```bash
/cmd-test
```

**When to use**: Validate implementations, check for regressions

### /refactor [target]
Improve code quality.

```bash
/refactor the authentication module
/refactor for better performance
```

**When to use**: Code quality improvements

## Fix Commands

### /cmd-fix__fast [issue]
Quick fixes for small issues.

```bash
/cmd-fix__fast the login button is not working
/cmd-fix__fast typo in error message
```

**When to use**: Simple, straightforward fixes

### /cmd-fix__hard [issue]
Complex issues requiring planning and subagents.

```bash
/cmd-fix__hard database connection pooling issues
/cmd-fix__hard race condition in payment processing
```

**When to use**: Complex bugs requiring deep investigation

### /cmd-fix__types
Fix TypeScript type errors.

```bash
/cmd-fix__types
```

**When to use**: TypeScript compilation errors

### /cmd-fix__test [issue]
Fix test failures.

```bash
/cmd-fix__test the user service tests are failing
/cmd-fix__test integration tests timing out
```

**When to use**: Test suite failures

### /cmd-fix__ui [issue]
Fix UI issues.

```bash
/cmd-fix__ui button alignment on mobile
/cmd-fix__ui dark mode colors inconsistent
```

**When to use**: Visual or interaction issues

### /cmd-fix__ci [url]
Analyze GitHub Actions logs and fix CI/CD issues.

```bash
/cmd-fix__ci https://github.com/owner/repo/actions/runs/123456
```

**When to use**: Build or deployment failures

### /cmd-fix__logs [issue]
Analyze logs and fix issues.

```bash
/cmd-fix__logs server error logs showing memory leaks
```

**When to use**: Production issues with log evidence

## Documentation Commands

### /cmd-docs__init
Create initial documentation structure.

```bash
/cmd-docs__init
```

**When to use**: New projects needing documentation

### /cmd-docs__update
Update existing documentation based on code changes.

```bash
/cmd-docs__update
```

**When to use**: After significant code changes

### /cmd-docs__summarize
Summarize codebase and create overview.

```bash
/cmd-docs__summarize
```

**When to use**: Generate project summaries

## Git Commands

### /cmd-git__cm
Stage all files and create commit.

```bash
/cmd-git__cm
```

**When to use**: Commit changes with automatic message

### /cmd-git__cp
Stage, commit, and push all code in current branch.

```bash
/cmd-git__cp
```

**When to use**: Commit and push in one command

### /cmd-git__pr [branch] [from-branch]
Create pull request.

```bash
/cmd-git__pr feature-branch main
/cmd-git__pr bugfix-auth develop
```

**When to use**: Creating PRs with automatic descriptions

## Planning Commands

### /cmd-plan__two [task]
Create implementation plan with 2 alternative approaches.

```bash
/cmd-plan__two implement caching layer
```

**When to use**: Need to evaluate multiple approaches

### /cmd-plan__ci [url]
Analyze GitHub Actions logs and create fix plan.

```bash
/cmd-plan__ci https://github.com/owner/repo/actions/runs/123456
```

**When to use**: CI/CD failure analysis

### /cmd-plan__cro [issue]
Create conversion rate optimization plan.

```bash
/cmd-plan__cro landing page conversion improvement
```

**When to use**: Marketing/conversion optimization

## Content Commands

### /cmd-content__fast [request]
Quick copy writing.

```bash
/cmd-content__fast write product description for new feature
```

**When to use**: Fast content generation

### /cmd-content__good [request]
High-quality, conversion-focused copy.

```bash
/cmd-content__good write landing page hero section
```

**When to use**: Marketing copy requiring polish

### /cmd-content__enhance [issue]
Enhance existing content.

```bash
/cmd-content__enhance improve clarity of pricing page
```

**When to use**: Improving existing copy

### /cmd-content__cro [issue]
Conversion rate optimization for content.

```bash
/cmd-content__cro optimize email campaign copy
```

**When to use**: Conversion-focused content improvements

## Design Commands

### /cmd-design__fast [task]
Quick design implementation.

```bash
/cmd-design__fast create dashboard layout
```

**When to use**: Rapid prototyping

### /cmd-design__good [task]
High-quality, polished design.

```bash
/cmd-design__good create landing page for SaaS product
```

**When to use**: Production-ready designs

### /cmd-design__3d [task]
Create 3D designs with Three.js.

```bash
/cmd-design__3d create interactive 3D product viewer
```

**When to use**: 3D visualization needs

### /cmd-design__screenshot [path]
Create design based on screenshot.

```bash
/cmd-design__screenshot screenshot.png
```

**When to use**: Recreating designs from images

### /cmd-design__video [path]
Create design based on video.

```bash
/cmd-design__video demo-video.mp4
```

**When to use**: Implementing designs from video demos

## Deployment Commands

### /deploy
Deploy using deployment tool.

```bash
/deploy
```

**When to use**: Production deployments

### /deploy-check
Check deployment readiness.

```bash
/deploy-check
```

**When to use**: Pre-deployment validation

## Other Commands

### /cmd-brainstorm [question]
Brainstorm features and ideas.

```bash
/cmd-brainstorm how to improve user onboarding
```

**When to use**: Ideation and exploration

### /cmd-ask [question]
Answer technical and architectural questions.

```bash
/cmd-ask what's the best way to handle websocket connections
```

**When to use**: Technical guidance

### /cmd-scout [prompt] [scale]
Scout directories to respond to requests.

```bash
/cmd-scout find authentication code
```

**When to use**: Code exploration

### /cmd-watzup
Review recent changes and wrap up work.

```bash
/cmd-watzup
```

**When to use**: End of session summary

### /cmd-bootstrap [requirements]
Bootstrap new project step by step.

```bash
/cmd-bootstrap create React app with TypeScript and Tailwind
```

**When to use**: New project setup

### /cmd-bootstrap__auto [requirements]
Bootstrap new project automatically.

```bash
/cmd-bootstrap__auto create Next.js app
```

**When to use**: Automated project setup

### /cmd-journal
Write journal entries for development log.

```bash
/cmd-journal
```

**When to use**: Development documentation

### /cmd-review__codebase [prompt]
Scan and analyze codebase.

```bash
/cmd-review__codebase analyze architecture patterns
```

**When to use**: Codebase analysis

### /cmd-skill__create [prompt]
Create new agent skill.

```bash
/cmd-skill__create create skill for API testing
```

**When to use**: Extending Claude with custom skills

## Creating Custom Slash Commands

### Command File Structure
```
.omp/evcrate/commands/
└── my-command.md
```

### Example Command File
```markdown
# File: .omp/evcrate/commands/my-command.md

Create comprehensive test suite for {{feature}}.

Include:
- Unit tests
- Integration tests
- Edge cases
- Mocking examples
```

### Usage
```bash
/my-command authentication
# Expands to: "Create comprehensive test suite for authentication..."
```

### Best Practices

**Clear prompts**: Write specific, actionable prompts
**Use variables**: `{{variable}}` for dynamic content
**Document usage**: Add comments explaining the command
**Test thoroughly**: Verify commands work as expected

## Command Arguments

### Single Argument
```bash
/cmd-cook implement user auth
# Argument: "implement user auth"
```

### Multiple Arguments
```bash
/cmd-git__pr feature-branch main
# Arguments: "feature-branch", "main"
```

### Optional Arguments
Some commands work with or without arguments:
```bash
/cmd-test              # Run all tests
/cmd-test user.test.js # Run specific test
```

## See Also

- Creating custom commands: `references/hooks-and-plugins.md`
- Command automation: `references/configuration.md`
- Best practices: `references/best-practices.md`
