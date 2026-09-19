// Playwright 10,000-record frozen performance benchmark.
import { test, expect } from '@playwright/test';
import { BrowserHistoryFixture } from './opfs-history-fixture.mjs';
import { populateLargeHistoryInBrowser } from './generate-large-history-fixture.mjs';

function nearestRank(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(1, Math.ceil(p * sorted.length)) - 1];
}

test.describe('10k Consultation Performance Benchmark', () => {
  test.setTimeout(120_000);

  test('AME-032: enforces frozen scan, detail, cancel, and long-task thresholds', async ({ page }) => {
    await BrowserHistoryFixture.install(page);
    await page.goto('/');

    // Install Long Task observer
    await page.evaluate(() => {
      window.__LONG_TASKS__ = [];
      try {
        const obs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 200) {
              window.__LONG_TASKS__.push({ name: entry.name, duration: entry.duration, startTime: entry.startTime });
            }
          }
        });
        obs.observe({ entryTypes: ['longtask'] });
      } catch {
        // Fallback for environments without longtask support
      }
    });

    // Populate 10,000 records
    await populateLargeHistoryInBrowser(page, 10000, 12345);

    const scanDurations = [];

    // Run 1: Initial Choose History Directory
    const t0 = Date.now();
    await page.click('button[aria-label="Choose history directory"]');
    await expect(page.locator('.status-banner')).toContainText('Fresh Snapshot', { timeout: 30_000 });
    scanDurations.push(Date.now() - t0);

    // Runs 2-5: Refresh History
    for (let i = 2; i <= 5; i++) {
      const tStart = Date.now();
      await page.click('button[aria-label="Refresh history"]');
      await expect(page.locator('.status-banner')).toContainText('Fresh Snapshot', { timeout: 30_000 });
      scanDurations.push(Date.now() - tStart);
    }

    const p95Scan = nearestRank(scanDurations, 0.95);

    // Measure 20 Detail selections
    await page.click('#tab-history');
    await expect(page.locator('#panel-history')).toBeVisible();

    const detailDurations = [];
    const rows = page.locator('.history-table tbody tr');
    const rowCount = Math.min(20, await rows.count());

    for (let i = 0; i < rowCount; i++) {
      const inspectBtn = rows.nth(i).locator('button[aria-label^="Inspect consultation"]');
      const dStart = Date.now();
      await inspectBtn.dispatchEvent('click');
      await expect(page.locator('aside.history-detail-drawer')).toBeVisible();
      detailDurations.push(Date.now() - dStart);
      await page.locator('button[aria-label="Close detail view"]').dispatchEvent('click');
    }

    const p95Detail = nearestRank(detailDurations, 0.95);

    // Measure Cancellation latency
    const fixture = new BrowserHistoryFixture(page);
    await fixture.setDelay(20);
    const refreshPromise = page.click('button[aria-label="Refresh history"]');
    await expect(page.locator('button[aria-label="Cancel scan"]')).toBeVisible();
    const cancelStart = Date.now();
    await page.click('button[aria-label="Cancel scan"]');
    await expect(page.locator('.status-banner')).toContainText('Stale Data Retained');
    const cancelLatency = Date.now() - cancelStart;
    await refreshPromise;
    await fixture.setDelay(0);

    // Check long tasks
    const longTasks = await page.evaluate(() => window.__LONG_TASKS__ || []);

    // Print benchmark report
    console.log('--- 10k Benchmark Results ---');
    console.log(`Scan durations (ms): ${scanDurations.join(', ')}`);
    console.log(`p95 Scan: ${p95Scan} ms (Threshold: <= 5000 ms)`);
    console.log(`p95 Detail: ${p95Detail} ms (Threshold: <= 100 ms)`);
    console.log(`Cancel latency: ${cancelLatency} ms (Threshold: <= 250 ms)`);
    console.log(`Unreported long tasks (>200ms): ${longTasks.length}`);

    expect(p95Scan).toBeLessThanOrEqual(5000);
    expect(p95Detail).toBeLessThanOrEqual(100);
    expect(cancelLatency).toBeLessThanOrEqual(250);
    expect(longTasks.length).toBe(0);
  });
});
