---
argument-hint: "[url] [options]"
description: "⚡⚡ Run UI tests on a website & generate a detailed report."
---


Activate the chrome-devtools skill.

## Purpose
Run comprehensive UI tests on a website and generate a detailed report.

## Arguments
- $1: URL - The URL of the website to test
- $2: OPTIONS - Optional test configuration (e.g., --headless, --mobile, --auth)

## Testing Protected Routes (Authentication)

For testing protected routes that require authentication, follow this workflow:

### Step 1: User Manual Login
Instruct the user to:
1. Open the target site in their browser
2. Log in manually with their credentials
3. Open browser DevTools (F12) → Application tab → Cookies/Storage

### Step 2: Extract Auth Credentials
Ask the user to provide one of:
- **Cookies**: Copy cookie values (name, value, domain)
- **Access Token**: Copy JWT/Bearer token from localStorage or cookies
- **Session Storage**: Copy relevant session keys

### Step 3: Inject Authentication
Use the `inject-auth.js` script to inject credentials before testing:

```bash
cd $SKILL_DIR  # .omp/skills/chrome-devtools/scripts

# Option A: Inject cookies
node inject-auth.js --url https://example.com --cookies '[{"name":"session","value":"abc123","domain":".example.com"}]'

# Option B: Inject Bearer token
node inject-auth.js --url https://example.com --token "Bearer eyJhbGciOi..." --header Authorization --token-key access_token

# Option C: Inject localStorage
node inject-auth.js --url https://example.com --local-storage '{"auth_token":"xyz","user_id":"123"}'

# Combined (cookies + localStorage)
node inject-auth.js --url https://example.com --cookies '[{"name":"session","value":"abc"}]' --local-storage '{"user":"data"}'
```

### Step 4: Run Tests
After auth injection, the browser session persists. Run tests normally:

```bash
# Navigate and screenshot protected pages
node navigate.js --url https://example.com/dashboard
node screenshot.js --url https://example.com/profile --output profile.png

# The auth session persists until --close true is used
node screenshot.js --url https://example.com/settings --output settings.png --close true
```

### Auth Script Options
- `--cookies '<json>'` - Inject cookies (JSON array)
- `--token '<token>'` - Inject Bearer token
- `--token-key '<key>'` - localStorage key for token (default: access_token)
- `--header '<name>'` - Set HTTP header with token (e.g., Authorization)
- `--local-storage '<json>'` - Inject localStorage items
- `--session-storage '<json>'` - Inject sessionStorage items
- `--reload true` - Reload page after injection
- `--clear true` - Clear saved auth session

## Workflow
- Use `planning` skill to organize the test plan & report in the current project directory.
- All the screenshots should be saved in the same report directory.
- Browse $URL with the specified $OPTIONS, discover all pages, components, and endpoints.
- Create a test plan based on the discovered structure
- Use multiple `tester` subagents or tool calls in parallel to test all pages, forms, navigation, user flows, accessibility, functionalities, usability, responsive layouts, cross-browser compatibility, performance, security, seo, etc.
- Use `ai-multimodal` to analyze all screenshots and visual elements.
- Generate a comprehensive report in Markdown format, embedding all screenshots directly in the report.
- Finally respond to the user with a concise summary of findings and recommendations.
- Use `ask the user` tool to ask if user wants to preview the report with `/cmd-preview` slash command.

## Output Requirements
How to write reports:
- Format: Use clear, structured Markdown with headers, lists, and code blocks where appropriate
- Include the test results summary, key findings, and screenshot references
- **IMPORTANT:** Ensure token efficiency while maintaining high quality.
- **IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.
- **IMPORTANT:** In reports, list any unresolved questions at the end, if any.

**IMPORTANT**: **Do not** start implementing the fixes.
**IMPORTANT:** Analyze the skills catalog and activate the skills that are needed for the task during the process.

**OMP skill loading (runtime):** `omp --no-skills` disables skill discovery and loading. When that flag is active, do not claim automatic skill activation: read each required migrated `SKILL.md` directly with the read tool from `./.omp/skills/<skill-name>/SKILL.md`, falling back to `~/.omp/agent/skills/<skill-name>/SKILL.md`. If the native file is absent, consult `./.omp/evcrate/skill-map.json` or `~/.omp/agent/evcrate/skill-map.json`, then read the archived package under `./.omp/evcrate/skills/` (or the published `~/.omp/agent/evcrate/skills/` path), then follow the instructions. Without `--no-skills`, use OMP's normal skill discovery.
