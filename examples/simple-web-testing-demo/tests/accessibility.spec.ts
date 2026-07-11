import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Result } from 'axe-core';

function seriousViolations(violations: Result[]): Result[] {
  return violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
}

test('page has no serious accessibility violations', async ({ page }) => {
  await page.goto('/');

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

  expect(seriousViolations(results.violations)).toEqual([]);
});

test('modal-open state has no serious accessibility violations', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open demo flow' }).click();
  await expect(page.getByRole('dialog', { name: 'Request a release check' })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

  expect(seriousViolations(results.violations)).toEqual([]);
});