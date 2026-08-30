# Slash Commands Reference

Comprehensive catalog of GitHub Copilot CLI slash commands for development workflows.

## What Are Slash Commands?

Slash commands are user-defined operations that:
- Start with `/` (e.g., `/evcrate-cmd-cook`, `/evcrate-cmd-test`)
- Expand to full prompts when executed
- Accept arguments
- Located in `.copilot/commands/`
- Can be project-specific or global

## Development Commands

### /evcrate-cmd-cook [task]
Implement features step by step.

```bash
/evcrate-cmd-cook implement user authentication with JWT
/evcrate-cmd-cook add payment integration with Stripe
```

**When to use**: Feature implementation with iterative development

### /evcrate-cmd-plan [task]
Research, analyze, and create implementation plans.

```bash
/evcrate-cmd-plan implement OAuth2 authentication
/evcrate-cmd-plan migrate from SQLite to PostgreSQL
```

**When to use**: Before starting complex implementations

### /evcrate-cmd-debug [issue]
Debug technical issues and provide solutions.

```bash
/evcrate-cmd-debug the API returns 500 errors intermittently
/evcrate-cmd-debug authentication flow not working
```

**When to use**: Investigating and diagnosing problems

### /evcrate-cmd-test
Run test suite.

```bash
/evcrate-cmd-test
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

### /evcrate-cmd-fix-fast [issue]
Quick fixes for small issues.

```bash
/evcrate-cmd-fix-fast the login button is not working
/evcrate-cmd-fix-fast typo in error message
```

**When to use**: Simple, straightforward fixes

### /evcrate-cmd-fix-hard [issue]
Complex issues requiring planning and subagents.

```bash
/evcrate-cmd-fix-hard database connection pooling issues
/evcrate-cmd-fix-hard race condition in payment processing
```

**When to use**: Complex bugs requiring deep investigation

### /evcrate-cmd-fix-types
Fix TypeScript type errors.

```bash
/evcrate-cmd-fix-types
```

**When to use**: TypeScript compilation errors

### /evcrate-cmd-fix-test [issue]
Fix test failures.

```bash
/evcrate-cmd-fix-test the user service tests are failing
/evcrate-cmd-fix-test integration tests timing out
```

**When to use**: Test suite failures

### /evcrate-cmd-fix-ui [issue]
Fix UI issues.

```bash
/evcrate-cmd-fix-ui button alignment on mobile
/evcrate-cmd-fix-ui dark mode colors inconsistent
```

**When to use**: Visual or interaction issues

### /evcrate-cmd-fix-ci [url]
Analyze GitHub Actions logs and fix CI/CD issues.

```bash
/evcrate-cmd-fix-ci https://github.com/owner/repo/actions/runs/123456
```

**When to use**: Build or deployment failures

### /evcrate-cmd-fix-logs [issue]
Analyze logs and fix issues.

```bash
/evcrate-cmd-fix-logs server error logs showing memory leaks
```

**When to use**: Production issues with log evidence

## Documentation Commands

### /evcrate-cmd-docs-init
Create initial documentation structure.

```bash
/evcrate-cmd-docs-init
```

**When to use**: New projects needing documentation

### /evcrate-cmd-docs-update
Update existing documentation based on code changes.

```bash
/evcrate-cmd-docs-update
```

**When to use**: After significant code changes

### /evcrate-cmd-docs-summarize
Summarize codebase and create overview.

```bash
/evcrate-cmd-docs-summarize
```

**When to use**: Generate project summaries

## Git Commands

### /evcrate-cmd-git-cm
Stage all files and create commit.

```bash
/evcrate-cmd-git-cm
```

**When to use**: Commit changes with automatic message

### /evcrate-cmd-git-cp
Stage, commit, and push all code in current branch.

```bash
/evcrate-cmd-git-cp
```

**When to use**: Commit and push in one command

### /evcrate-cmd-git-pr [branch] [from-branch]
Create pull request.

```bash
/evcrate-cmd-git-pr feature-branch main
/evcrate-cmd-git-pr bugfix-auth develop
```

**When to use**: Creating PRs with automatic descriptions

## Planning Commands

### /evcrate-cmd-plan-two [task]
Create implementation plan with 2 alternative approaches.

```bash
/evcrate-cmd-plan-two implement caching layer
```

**When to use**: Need to evaluate multiple approaches

### /evcrate-cmd-plan-ci [url]
Analyze GitHub Actions logs and create fix plan.

```bash
/evcrate-cmd-plan-ci https://github.com/owner/repo/actions/runs/123456
```

**When to use**: CI/CD failure analysis

### /evcrate-cmd-plan-cro [issue]
Create conversion rate optimization plan.

```bash
/evcrate-cmd-plan-cro landing page conversion improvement
```

**When to use**: Marketing/conversion optimization

## Content Commands

### /evcrate-cmd-content-fast [request]
Quick copy writing.

```bash
/evcrate-cmd-content-fast write product description for new feature
```

**When to use**: Fast content generation

### /evcrate-cmd-content-good [request]
High-quality, conversion-focused copy.

```bash
/evcrate-cmd-content-good write landing page hero section
```

**When to use**: Marketing copy requiring polish

### /evcrate-cmd-content-enhance [issue]
Enhance existing content.

```bash
/evcrate-cmd-content-enhance improve clarity of pricing page
```

**When to use**: Improving existing copy

### /evcrate-cmd-content-cro [issue]
Conversion rate optimization for content.

```bash
/evcrate-cmd-content-cro optimize email campaign copy
```

**When to use**: Conversion-focused content improvements

## Design Commands

### /evcrate-cmd-design-fast [task]
Quick design implementation.

```bash
/evcrate-cmd-design-fast create dashboard layout
```

**When to use**: Rapid prototyping

### /evcrate-cmd-design-good [task]
High-quality, polished design.

```bash
/evcrate-cmd-design-good create landing page for SaaS product
```

**When to use**: Production-ready designs

### /evcrate-cmd-design-3d [task]
Create 3D designs with Three.js.

```bash
/evcrate-cmd-design-3d create interactive 3D product viewer
```

**When to use**: 3D visualization needs

### /evcrate-cmd-design-screenshot [path]
Create design based on screenshot.

```bash
/evcrate-cmd-design-screenshot screenshot.png
```

**When to use**: Recreating designs from images

### /evcrate-cmd-design-video [path]
Create design based on video.

```bash
/evcrate-cmd-design-video demo-video.mp4
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

## Integration Commands

### /evcrate-cmd-integrate-polar [tasks]
Implement payment integration with Polar.sh.

```bash
/evcrate-cmd-integrate-polar add subscription payments
```

**When to use**: Polar payment integration

### /evcrate-cmd-integrate-sepay [tasks]
Implement payment integration with SePay.vn.

```bash
/evcrate-cmd-integrate-sepay add Vietnamese payment gateway
```

**When to use**: SePay payment integration

## Other Commands

### /evcrate-cmd-brainstorm [question]
Brainstorm features and ideas.

```bash
/evcrate-cmd-brainstorm how to improve user onboarding
```

**When to use**: Ideation and exploration

### /evcrate-cmd-ask [question]
Answer technical and architectural questions.

```bash
/evcrate-cmd-ask what's the best way to handle websocket connections
```

**When to use**: Technical guidance

### /evcrate-cmd-scout [prompt] [scale]
Scout directories to respond to requests.

```bash
/evcrate-cmd-scout find authentication code
```

**When to use**: Code exploration

### /evcrate-cmd-watzup
Review recent changes and wrap up work.

```bash
/evcrate-cmd-watzup
```

**When to use**: End of session summary

### /evcrate-cmd-bootstrap [requirements]
Bootstrap new project step by step.

```bash
/evcrate-cmd-bootstrap create React app with TypeScript and Tailwind
```

**When to use**: New project setup

### /evcrate-cmd-bootstrap-auto [requirements]
Bootstrap new project automatically.

```bash
/evcrate-cmd-bootstrap-auto create Next.js app
```

**When to use**: Automated project setup

### /evcrate-cmd-journal
Write journal entries for development log.

```bash
/evcrate-cmd-journal
```

**When to use**: Development documentation

### /evcrate-cmd-review-codebase [prompt]
Scan and analyze codebase.

```bash
/evcrate-cmd-review-codebase analyze architecture patterns
```

**When to use**: Codebase analysis

### /evcrate-cmd-skill-create [prompt]
Create new agent skill.

```bash
/evcrate-cmd-skill-create create skill for API testing
```

**When to use**: Extending Copilot with custom skills

## Creating Custom Slash Commands

### Command File Structure
```
.copilot/commands/
└── my-command.md
```

### Example Command File
```markdown
# File: .copilot/commands/my-command.md

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
/evcrate-cmd-cook implement user auth
# Argument: "implement user auth"
```

### Multiple Arguments
```bash
/evcrate-cmd-git-pr feature-branch main
# Arguments: "feature-branch", "main"
```

### Optional Arguments
Some commands work with or without arguments:
```bash
/evcrate-cmd-test              # Run all tests
/evcrate-cmd-test user.test.js # Run specific test
```

## See Also

- Creating custom commands: `references/hooks-and-plugins.md`
- Command automation: `references/configuration.md`
- Best practices: `references/best-practices.md`
