# Common Claude Code Workflows

## Feature Implementation

**Plan first approach:**
```bash
/cmd-plan implement payment integration with Stripe
# Review plan, then proceed with implementation
/cmd-cook implement payment integration with Stripe
```

**Direct implementation:**
```bash
/cmd-cook implement user authentication with JWT
/cmd-cook__auto add dark mode toggle to settings
```

## Bug Fixing

**Quick fixes:**
```bash
/cmd-fix__fast login button not working
/cmd-fix__types  # Fix TypeScript errors
```

**Complex debugging:**
```bash
/cmd-debug API returns 500 errors intermittently
/cmd-fix__hard authentication flow breaks after password reset
```

**Test-driven fixes:**
```bash
/cmd-fix__test user service tests failing
/cmd-test  # Run full test suite
```

**CI/CD failures:**
```bash
/cmd-fix__ci https://github.com/org/repo/actions/runs/12345
```

## Code Review & Testing

```bash
# Review recent changes
claude "review my latest commit"
claude "analyze the changes in PR #42"

# Run tests
/cmd-test
/cmd-fix__test payment tests failing
```

## Documentation Management

```bash
/cmd-docs__init                    # Create initial docs structure
/cmd-docs__update                  # Update all docs based on codebase
/cmd-docs__summarize auth security # Focused documentation update
```

## Git Operations

```bash
/cmd-git__cm                        # Stage and commit
/cmd-git__cp                        # Stage, commit, and push
/cmd-git__pr feature-branch main    # Create pull request from feature-branch to main
```

## Design & Content

**UI/UX design:**
```bash
/cmd-design__fast create landing page for SaaS product
/cmd-design__good build immersive dashboard with data viz
/cmd-design__screenshot analyze this design and suggest improvements
```

**Content creation:**
```bash
/cmd-content__good write product description for new feature
/cmd-content__fast create blog post about our API
/cmd-content__cro optimize landing page copy for conversions
```

## Project Initialization

```bash
/cmd-bootstrap__auto create Next.js app with auth and database
/cmd-bootstrap__auto__fast quick React app with TypeScript
```

## Advanced Workflows

**Codebase analysis:**
```bash
/cmd-review__codebase analyze authentication implementation
/cmd-scout__ext find all payment-related files
```

**Strategic planning:**
```bash
/cmd-plan__hard implement real-time collaboration features
/cmd-plan__two compare serverless vs traditional backend approaches
/cmd-brainstorm improve onboarding UX
```

**Payment integrations:**
```bash
/integrate:sepay add Vietnamese payment gateway
/integrate:polar implement subscription billing
```

**Skill management:**
```bash
/cmd-skill__create payment-processing  # Create new skill
/cmd-skill__optimize frontend-dev      # Improve existing skill
```
