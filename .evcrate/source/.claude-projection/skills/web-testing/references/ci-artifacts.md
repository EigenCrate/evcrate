# CI, Artifacts, And Flake Control

CI should make browser failures explainable. It should not hide weak tests behind retries or drown developers in artifacts from passing runs.

## Playwright Artifact Policy

Use failure-focused artifacts by default:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'blob' : 'html',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
```

Use `trace: 'on'` only for focused local debugging or short-lived investigations. It is too heavy as a default release gate.

## Retry Policy

Retries should answer, "is this a transient CI issue and do we have artifacts?" They should not make a flaky test look healthy.

- Use zero retries locally unless debugging a known CI-only issue.
- Use one retry in CI for browser suites when artifacts are retained on failure/first retry.
- Treat any retry pass as a flake signal in reports.
- Do not raise retries before investigating selectors, waits, network control, and test isolation.

## Sharding Large Suites

Use Playwright sharding when suite runtime is the bottleneck and tests are independent:

```bash
npx playwright test --shard=1/4
npx playwright test --shard=2/4
npx playwright test --shard=3/4
npx playwright test --shard=4/4
```

For CI, use blob reports per shard and merge them after all shards finish:

```bash
npx playwright merge-reports --reporter html ./all-blob-reports
```

Keep test files small and parallel-friendly. Uneven files create slow shards.

## Flake Audit Checklist

When a web suite flakes, inspect these before changing timeouts or retries:

- CSS/XPath selectors that should be role/name/label/testId locators
- `waitForTimeout` or fixed sleeps
- manual one-shot assertions such as `isVisible()` inside `expect`
- tests depending on previous test state
- shared mutable accounts, local storage, cookies, database rows, or queues
- uncontrolled third-party APIs
- animations, timers, dates, random data, and viewport-dependent layout
- missing `await` before Playwright actions or assertions

## CI Evidence To Preserve

For failed browser gates, preserve:

- Playwright HTML report or merged blob report
- trace from first retry or failed run
- screenshot/video only for failed tests
- accessibility report or serialized violations
- Lighthouse JSON/HTML report when performance gate runs
- k6 summary output and thresholds

In the final response, link or name the artifact path when available and state if no artifact was produced.