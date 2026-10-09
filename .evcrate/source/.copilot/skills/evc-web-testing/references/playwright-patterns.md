# Playwright Patterns

Playwright tests should behave like a patient user, not like a DOM scraper. Use locators and assertions that wait for the application to become ready.

## Locator Ladder

Prefer selectors in this order:

1. `page.getByRole('button', { name: 'Save' })`
2. `page.getByLabel('Email')`
3. `page.getByPlaceholder('Search')` or visible text when it is stable user copy
4. `page.getByTestId('checkout-submit')` for explicit testing contracts
5. CSS selectors only for non-user-facing structure or legacy surfaces

Avoid XPath and styling-class selectors for user actions. They break when markup changes without user-visible behavior changing.

## Web-First Assertions

Use retrying assertions:

```ts
await page.getByRole('button', { name: 'Submit order' }).click();
await expect(page.getByRole('status')).toHaveText('Order submitted');
```

Avoid one-shot checks:

```ts
expect(await page.getByText('Order submitted').isVisible()).toBe(true);
```

The second form reads like a test, but it does not wait for asynchronous UI updates and often flakes.

## Replace Hard Waits

Replace `waitForTimeout` with a condition that explains what readiness means.

```ts
await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
await page.getByRole('button', { name: 'Save' }).click();
await expect(page.getByRole('alert')).toContainText('Saved');
```

For API-backed readiness:

```ts
await expect.poll(async () => {
  const response = await page.request.get('/api/jobs/latest');
  return response.status();
}).toBe(200);
```

Use `page.waitForResponse` only when the response is the actual user-visible dependency. Still assert the UI state after the response.

## Modal And Keyboard Checks

For dialogs, menus, drawers, and popovers, test the interaction contract:

```ts
await page.getByRole('button', { name: 'Open checkout' }).click();
const dialog = page.getByRole('dialog', { name: 'Checkout' });

await expect(dialog).toBeVisible();
await expect(dialog.getByRole('button', { name: 'Submit order' })).toBeEnabled();
await page.keyboard.press('Tab');
await expect(dialog.getByRole('button', { name: 'Submit order' })).toBeFocused();
await page.keyboard.press('Escape');
await expect(dialog).toBeHidden();
```

If exact focus order is intentionally flexible, assert that focus remains inside the dialog rather than hard-coding every tab stop.

## Isolation

- Create or reset test data in `beforeEach` or fixtures.
- Avoid shared accounts that mutate across tests unless the app provides a stable shared setup state.
- Mock third-party services you do not control. Test your integration contract, not an external vendor's uptime.
- Keep test files small and parallel-friendly for CI sharding.

## Visual Assertions

Use screenshots for layout contracts, not for every page by habit.

```ts
await expect(page).toHaveScreenshot('checkout-summary.png', {
  fullPage: true,
  animations: 'disabled',
});
```

Make visual tests deterministic: fixed data, stable viewport, disabled animations when appropriate, same browser/OS in CI.