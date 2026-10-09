# Accessibility, Performance, Visual, And Load Gates

These gates catch failures that unit tests rarely see. Apply them when the changed surface creates real user risk.

## Accessibility With Axe And Keyboard Checks

Automated axe scans are useful, but they do not replace keyboard and focus testing. Pair them for interactive UI.

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('checkout dialog has no serious accessibility violations', async ({ page }) => {
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Review order' }).click();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  expect(results.violations).toEqual([]);
});
```

For large legacy pages, scope the scan to the changed surface and document the reason:

```ts
const results = await new AxeBuilder({ page })
  .include('[data-testid="checkout-dialog"]')
  .withTags(['wcag2a', 'wcag2aa'])
  .analyze();
```

Check manually or with Playwright for:

- focus enters and leaves dialogs predictably
- Escape closes dismissible overlays
- tab order reaches primary controls
- form fields have labels and useful errors
- custom controls expose role, name, state, and keyboard behavior

## Lighthouse And Core Web Vitals

Use Lighthouse or Lighthouse CI for lab regression gates. Track Core Web Vitals for release risk:

- LCP should be at or below 2.5 seconds.
- INP should be at or below 200 milliseconds in field data.
- CLS should be at or below 0.1.

Lighthouse lab runs cannot directly measure real INP without user interaction; use Total Blocking Time as a lab proxy and prefer real-user monitoring when available.

Example budget intent:

```json
{
  "ci": {
    "assert": {
      "assertions": {
        "largest-contentful-paint": ["warn", { "maxNumericValue": 2500 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }],
        "total-blocking-time": ["warn", { "maxNumericValue": 300 }]
      }
    }
  }
}
```

Tune budgets to the project baseline. A budget that every existing page fails is noise, not a gate.

## Visual Regression

Use visual regression when a change can drift without breaking DOM assertions:

- responsive layout changes
- charts, tables, dashboards, and dense panels
- generated documents or marketing pages
- theme and design-system changes

Stabilize inputs: fixed test data, deterministic fonts, same browser, same OS, disabled animations when they are not the subject of the test.

## k6 Load Testing

Use k6 when the changed browser flow depends on load-sensitive APIs or high-traffic endpoints. Start with a smoke test in PR and reserve heavier load for scheduled or pre-release runs.

```js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

export default function () {
  const response = http.get(`${__ENV.BASE_URL}/api/orders/summary`);
  check(response, {
    'status is 200': (res) => res.status === 200,
  });
}
```

Report thresholds and environment. Load results without a target environment description are hard to interpret.