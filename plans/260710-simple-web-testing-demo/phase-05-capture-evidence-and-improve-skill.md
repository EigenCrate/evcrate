# Phase 05: Capture Evidence And Improve Skill

## Context Links

- Parent plan: [plan.md](./plan.md)
- Previous phase: [phase-04-apply-web-testing-release-gate.md](./phase-04-apply-web-testing-release-gate.md)
- Skill evals: `.claude/skills/web-testing/evals/evals.json`
- Skill creator: `.claude/skills/skill-creator/SKILL.md`

## Overview

- Date: 2026-07-10
- Priority: P2
- Implementation status: Complete
- Review status: Approved
- Description: Run the gates, record evidence, and use results to improve `web-testing` if the skill leaves gaps.

## Key Insights

- The final deliverable is evidence, not just files.
- A dogfood run should evaluate whether the skill actually guides agent behavior.
- Any improvement to `web-testing` must stay under `.claude/skills/web-testing/` only.

## Requirements

- Run the full web gate where environment allows.
- Capture exact commands, results, and artifact paths.
- Produce release evidence report in the skill's required shape.
- Compare execution against `evals/evals.json` expectations.
- Patch skill only if dogfood reveals concrete missing guidance.

## Architecture

- Evidence lives in demo README or a plan report.
- Skill changes, if any, touch only `.claude/skills/web-testing/`.
- Generated `.agents`, `.codex`, `.gemini` outputs remain untouched until distribute.

## Related Code Files

- Modify: `examples/simple-web-testing-demo/README.md`
- Create: `plans/260710-simple-web-testing-demo/reports/260710-from-tester-to-main-web-gate-report.md`
- Optional modify: `.claude/skills/web-testing/SKILL.md`
- Optional modify: `.claude/skills/web-testing/references/*.md`

## Implementation Steps

1. Run `npm run test`.
2. Run `npm run test:e2e`.
3. Run accessibility and visual scripts.
4. Run build and Lighthouse gate.
5. Run k6 smoke if available.
6. Write Web Testing Gate report with pass/fail and artifacts.
7. Review whether the skill needs clarification or extra references.

## Todo List

- [x] Run all available gates.
- [x] Capture evidence report.
- [x] Note blocked gates with reason.
- [x] Compare results to skill eval expectations.
- [x] Patch skill if needed.

## Success Criteria

- Final report includes changed surface, risk covered, commands, result, evidence, release decision, and remaining risk.
- No release-ready claim without fresh command output.
- Any skill updates are validated with frontmatter/JSON checks.

## Risk Assessment

- Risk: Environment lacks browsers or k6.
- Mitigation: Record blocker and provide next cheapest check.
- Risk: Agent overfits skill to demo.
- Mitigation: Improve general guidance only when gap applies beyond the demo.

## Security Considerations

- Do not upload local reports to third-party services by default.
- Do not include local machine secrets or paths with sensitive data in public docs.

## Next Steps

- User reviews evidence and decides whether to package/distribute updated skill assets.