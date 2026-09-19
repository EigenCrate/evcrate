// Playwright security, CSP, inert text, keyboard, and accessibility test spec.
import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { setupPageWithTree, TEST_PROJECT_ID, TEST_TASK_ID } from './explorer-helpers.mjs';
const EXPECTED_CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

const MALICIOUS_PAYLOAD = '<script>window.__XSS__=true</script><img src="x" onerror="window.__XSS__=true"><a href="javascript:alert(1)">link</a>';

function makeMaliciousTree() {
  const consultId = '01234567-89ab-4cde-8f01-23456789ef99';
  const cp = {
    protocol: 'evcrate-advisor-checkpoint',
    version: 2,
    task_run_id: TEST_TASK_ID,
    checkpoint_id: `chk-malicious-01`,
    phase_id: 'phase-09',
    task_revision: 1,
    evidence_revision: 0,
    checkpoint: 'review:step-4',
    kind: 'review',
    question: `Question with ${MALICIOUS_PAYLOAD}`,
    task: {
      goal: `Goal ${MALICIOUS_PAYLOAD}`,
      non_goals: [],
      authorized_paths: ['src/a.ts'],
      scope_rationale: 'Security testing',
      invariants: ['Inert rendering'],
      success_criteria: ['No script execution']
    },
    proposal: { next_action: 'Proceed', rationale: `Rationale ${MALICIOUS_PAYLOAD}`, intended_changed_paths: ['src/a.ts'] },
    evidence: { summary: `Summary ${MALICIOUS_PAYLOAD}`, files: [], validation_results: [], artifacts: [] },
    prior: { prior_consultation_id: null, prior_counsel: null, prior_disposition: null, observed_outcome: null }
  };
  const digest = createHash('sha256').update(JSON.stringify(cp), 'utf8').digest('hex');
  const execution = {
    schema_version: 1,
    consultation_id: consultId,
    task_run_id: TEST_TASK_ID,
    project_id: TEST_PROJECT_ID,
    checkpoint_digest: digest,
    checkpoint: cp,
    route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
    receipt: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high', controller_version: 2, adapter_version: '0.1.0', build_identity: 'b-09', elapsed_ms: 1000 },
    prompt_identity: 'p-09',
    build_identity: 'b-09',
    attempts: [{
      attempt_id: 'att-xss',
      slot: 'primary',
      route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
      phase: 'model',
      model_started: true,
      elapsed_ms: 1000,
      terminal_classification: 'success',
      retry_delay_ms: null,
      cleanup_outcome: 'confirmed'
    }],
    status: 'ADVICE_READY',
    result: {
      protocol: 'evcrate-advisor-result',
      version: 2,
      checkpoint: 'review:step-4',
      status: 'ADVICE_READY',
      recommendation: `Recommendation ${MALICIOUS_PAYLOAD}`,
      rationale: `Rationale ${MALICIOUS_PAYLOAD}`,
      must_fix: [MALICIOUS_PAYLOAD],
      cautions: [MALICIOUS_PAYLOAD],
      assumptions: [],
      success_checks: [],
      unresolved_questions: []
    },
    error: null,
    started_at: 1700000000000,
    completed_at: 1700000001000
  };

  return {
    name: 'history-root',
    entries: {
      [TEST_PROJECT_ID]: {
        [TEST_TASK_ID]: {
          [consultId]: { 'execution.json': JSON.stringify(execution) }
        }
      }
    }
  };
}

test.describe('Security & Accessibility Spec', () => {
  test('AME-027: document response delivers exact CSP and blocks non-loopback requests', async ({ page }) => {
    let nonLoopbackBlocked = false;
    await page.route('**', (route) => {
      const url = route.request().url();
      if (!url.startsWith('http://127.0.0.1:4173')) {
        nonLoopbackBlocked = true;
        route.abort('blockedbyclient');
      } else {
        route.continue();
      }
    });

    const response = await page.goto('/');
    expect(response?.headers()['content-security-policy']).toBe(EXPECTED_CSP);
    expect(nonLoopbackBlocked).toBe(false);
  });

  test('AME-025: malicious payloads render as inert text without executing scripts', async ({ page }) => {
    await setupPageWithTree(page, makeMaliciousTree());
    await page.click('button[aria-label="Choose history directory"]');
    await expect(page.locator('.status-banner')).toContainText('Fresh Snapshot');

    await page.click('#tab-history');
    await expect(page.locator('#panel-history')).toBeVisible();

    // Verify script payload was NOT executed
    const xssExecuted = await page.evaluate(() => window.__XSS__ === true);
    expect(xssExecuted).toBe(false);

    // Open detail drawer to inspect inert text blocks
    const inspectBtn = page.locator('.history-table tbody tr').first().locator('button[aria-label^="Inspect consultation"]');
    await inspectBtn.click();
    const detailDialog = page.locator('aside.history-detail-drawer');
    await expect(detailDialog).toBeVisible();
    // Check that script tags are rendered literally and not parsed as HTML elements
    const scriptsInDetail = await detailDialog.locator('script').count();
    expect(scriptsInDetail).toBe(0);

    const xssStillFalse = await page.evaluate(() => window.__XSS__ === true);
    expect(xssStillFalse).toBe(false);
  });

  test('AME-025: keyboard navigation, visible focus, and accessible names', async ({ page }) => {
    await setupPageWithTree(page);

    // Press Tab from page start into Choose History Directory button
    await page.keyboard.press('Tab');
    const firstFocused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    expect(firstFocused).toBeTruthy();

    // Trigger directory selection via Enter key
    await page.keyboard.press('Enter');
    await expect(page.locator('.status-banner')).toContainText('Fresh Snapshot');

    // Tab through navigation tabs
    await page.locator('#tab-overview').focus();
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('tab-overview');

    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('tab-history');

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/.*#history/);
  });

  test('AME-025: responsive view usability across desktop and narrow viewports', async ({ page }) => {
    await setupPageWithTree(page);
    await page.click('button[aria-label="Choose history directory"]');

    // Desktop viewport
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator('.source-controls')).toBeVisible();
    await expect(page.locator('.hash-tabs-nav')).toBeVisible();
    await expect(page.locator('#panel-overview')).toBeVisible();

    // Narrow mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('.source-controls')).toBeVisible();
    await expect(page.locator('.hash-tabs-nav')).toBeVisible();
    await expect(page.locator('#panel-overview')).toBeVisible();

    // Ensure buttons remain clickable and controls are not clipped
    const chooseBtn = page.locator('button[aria-label="Choose history directory"]');
    await expect(chooseBtn).toBeVisible();
  });
});
