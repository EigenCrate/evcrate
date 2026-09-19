// Playwright functional and mutation tests for Advisor Metrics Explorer.
import { test, expect } from '@playwright/test';
import {
  TEST_PROJECT_ID,
  TEST_TASK_ID,
  TEST_CONSULT_ID_1,
  makeExecution,
  makeOutcome,
  makeSamplePolicy,
  makeSampleEvaluation,
  setupPageWithTree
} from './explorer-helpers.mjs';

test.describe('Advisor Metrics Explorer Functional Spec', () => {
  test('AME-016/AME-018: initial idle state, select root, and load fresh snapshot', async ({ page }) => {
    const fixture = await setupPageWithTree(page);
    await expect(page.locator('.status-banner')).toContainText('No history directory selected');
    await expect(page.locator('#panel-overview')).toContainText('No Advisor History Loaded');

    await page.click('button[aria-label="Choose history directory"]');
    await expect(page.locator('.status-banner')).toContainText('Fresh Snapshot');
    await expect(page.locator('.status-banner')).toContainText('Scanned 2 records successfully');
    await expect(page.locator('#panel-overview')).toContainText('Consultations: 2');
  });

  test('AME-018: external add consultation and Refresh atomically updates denominators', async ({ page }) => {
    const fixture = await setupPageWithTree(page);
    await page.click('button[aria-label="Choose history directory"]');
    await expect(page.locator('#panel-overview')).toContainText('Consultations: 2');

    const newConsultId = '01234567-89ab-4cde-8f01-23456789ef03';
    await fixture.addConsultation(TEST_PROJECT_ID, TEST_TASK_ID, newConsultId, makeExecution(newConsultId), makeOutcome(newConsultId));

    await page.click('button[aria-label="Refresh history"]');
    await expect(page.locator('.status-banner')).toContainText('Fresh Snapshot');
    await expect(page.locator('.status-banner')).toContainText('Scanned 3 records successfully');
    await expect(page.locator('#panel-overview')).toContainText('Consultations: 3');
  });

  test('AME-018: external update outcome and delete consultation on Refresh', async ({ page }) => {
    const fixture = await setupPageWithTree(page);
    await page.click('button[aria-label="Choose history directory"]');
    await expect(page.locator('#panel-overview')).toContainText('Consultations: 2');

    // Add outcome to consultation 2 (which lacked one)
    const updatedOutcome = makeOutcome('01234567-89ab-4cde-8f01-23456789ef02');
    await fixture.updateOutcome(TEST_PROJECT_ID, TEST_TASK_ID, '01234567-89ab-4cde-8f01-23456789ef02', updatedOutcome);
    await page.click('button[aria-label="Refresh history"]');
    await expect(page.locator('.status-banner')).toContainText('Scanned 2 records successfully');

    // Delete consultation 1
    await fixture.deleteConsultation(TEST_PROJECT_ID, TEST_TASK_ID, TEST_CONSULT_ID_1);
    await page.click('button[aria-label="Refresh history"]');
    await expect(page.locator('.status-banner')).toContainText('Scanned 1 records successfully');
    await expect(page.locator('#panel-overview')).toContainText('Consultations: 1');
  });

  test('AME-018: scan cancellation retains prior snapshot and marks stale', async ({ page }) => {
    const fixture = await setupPageWithTree(page);
    await page.click('button[aria-label="Choose history directory"]');
    await expect(page.locator('#panel-overview')).toContainText('Consultations: 2');

    // Introduce delay and trigger refresh then cancel
    await fixture.setDelay(300);
    const refreshPromise = page.click('button[aria-label="Refresh history"]');
    await expect(page.locator('button[aria-label="Cancel scan"]')).toBeVisible();
    await page.click('button[aria-label="Cancel scan"]');
    await refreshPromise;

    await expect(page.locator('.status-banner')).toContainText('Stale Data Retained');
    await expect(page.locator('#panel-overview')).toContainText('Consultations: 2');
  });

  test('AME-018: permission revocation on refresh retains prior snapshot', async ({ page }) => {
    const fixture = await setupPageWithTree(page);
    await page.click('button[aria-label="Choose history directory"]');
    await expect(page.locator('#panel-overview')).toContainText('Consultations: 2');

    await fixture.setPermission('denied');
    await page.click('button[aria-label="Refresh history"]');

    await expect(page.locator('.status-banner')).toContainText('Stale Data Retained');
    await expect(page.locator('#panel-overview')).toContainText('Consultations: 2');
  });

  test('AME-020: policy file selection displays configuration view without mutating history', async ({ page }) => {
    const fixture = await setupPageWithTree(page);
    await fixture.setPolicyFile('advisor-routing.json', JSON.stringify(makeSamplePolicy()));

    await page.click('button[aria-label="Choose policy file"]');
    await page.click('#tab-configuration');
    await expect(page.locator('#panel-configuration')).toContainText('Primary Route:');
    await expect(page.locator('#panel-configuration')).toContainText('codex / gpt-5.6-sol (high)');
  });

  test('AME-021/AME-022: evaluation files import displays comparable groups', async ({ page }) => {
    const fixture = await setupPageWithTree(page);
    const evalDoc = makeSampleEvaluation('eval-1');
    await fixture.setEvaluationFiles([{ name: 'eval-1.json', content: JSON.stringify(evalDoc) }]);

    await page.click('button[aria-label="Choose evaluation files"]');
    await page.click('#tab-evaluations');
    await expect(page.locator('#panel-evaluations')).toContainText('5ec033e8');
    await expect(page.locator('#panel-evaluations')).toContainText('Counsel Evaluations (1 documents)');
  });

  test('AME-024: hash tab navigation activates panels and updates URL hash', async ({ page }) => {
    await setupPageWithTree(page);
    await page.click('#tab-history');
    await expect(page).toHaveURL(/.*#history/);
    await expect(page.locator('#panel-history')).toBeVisible();

    await page.click('#tab-configuration');
    await expect(page).toHaveURL(/.*#configuration/);
    await expect(page.locator('#panel-configuration')).toBeVisible();

    await page.click('#tab-overview');
    await expect(page).toHaveURL(/.*#overview/);
    await expect(page.locator('#panel-overview')).toBeVisible();
  });

  test('AME-026: unsupported capability displays explicit guidance without fallback', async ({ page }) => {
    await page.addInitScript(() => {
      delete window.showDirectoryPicker;
      delete window.showOpenFilePicker;
    });
    await page.goto('/');
    await expect(page.locator('.status-banner')).toContainText('Unsupported Browser Capability');
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
  });
});
