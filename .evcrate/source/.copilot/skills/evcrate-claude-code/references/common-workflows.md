# Common GitHub Copilot CLI Workflows

## Feature Implementation

**Plan first approach:**
```bash
/evcrate-cmd-plan implement payment integration with Stripe
# Review plan, then proceed with implementation
/evcrate-cmd-cook implement payment integration with Stripe
```

**Direct implementation:**
```bash
/evcrate-cmd-cook implement user authentication with JWT
/evcrate-cmd-cook-auto add dark mode toggle to settings
```

## Bug Fixing

**Quick fixes:**
```bash
/evcrate-cmd-fix-fast login button not working
/evcrate-cmd-fix-types  # Fix TypeScript errors
```

**Complex debugging:**
```bash
/evcrate-cmd-debug API returns 500 errors intermittently
/evcrate-cmd-fix-hard authentication flow breaks after password reset
```

**Test-driven fixes:**
```bash
/evcrate-cmd-fix-test user service tests failing
/evcrate-cmd-test  # Run full test suite
```

**CI/CD failures:**
```bash
/evcrate-cmd-fix-ci https://github.com/org/repo/actions/runs/12345
```

## Code Review & Testing

```bash
# Review recent changes
copilot "review my latest commit"
copilot "analyze the changes in PR #42"

# Run tests
/evcrate-cmd-test
/evcrate-cmd-fix-test payment tests failing
```

## Documentation Management

```bash
/evcrate-cmd-docs-init                    # Create initial docs structure
/evcrate-cmd-docs-update                  # Update all docs based on codebase
/evcrate-cmd-docs-summarize auth security # Focused documentation update
```

## Git Operations

```bash
/evcrate-cmd-git-cm                        # Stage and commit
/evcrate-cmd-git-cp                        # Stage, commit, and push
/evcrate-cmd-git-pr feature-branch main    # Create pull request from feature-branch to main
```

## Design & Content

**UI/UX design:**
```bash
/evcrate-cmd-design-fast create landing page for SaaS product
/evcrate-cmd-design-good build immersive dashboard with data viz
/evcrate-cmd-design-screenshot analyze this design and suggest improvements
```

**Content creation:**
```bash
/evcrate-cmd-content-good write product description for new feature
/evcrate-cmd-content-fast create blog post about our API
/evcrate-cmd-content-cro optimize landing page copy for conversions
```

## Project Initialization

```bash
/evcrate-cmd-bootstrap-auto create Next.js app with auth and database
/evcrate-cmd-bootstrap:auto:fast quick React app with TypeScript
```

## Advanced Workflows

**Codebase analysis:**
```bash
/evcrate-cmd-review-codebase analyze authentication implementation
/evcrate-cmd-scout-ext find all payment-related files
```

**Strategic planning:**
```bash
/evcrate-cmd-plan-hard implement real-time collaboration features
/evcrate-cmd-plan-two compare serverless vs traditional backend approaches
/evcrate-cmd-brainstorm improve onboarding UX
```

**Payment integrations:**
```bash
/integrate:sepay add Vietnamese payment gateway
/integrate:polar implement subscription billing
```

**Skill management:**
```bash
/evcrate-cmd-skill-create payment-processing  # Create new skill
/evcrate-cmd-skill-optimize frontend-dev      # Improve existing skill
```
