import { expect, test } from '@playwright/test';

test.use({
  viewport: { width: 1280, height: 720 },
  colorScheme: 'light',
});

async function disableMotion(page: import('@playwright/test').Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        transition-duration: 0s !important;
        caret-color: transparent !important;
      }
    `,
  });
}

test('home page layout matches visual baseline', async ({ page }) => {
  await page.goto('/');
  await disableMotion(page);

  await expect(page).toHaveScreenshot('home-page.png', {
    fullPage: true,
    animations: 'disabled',
  });
});

test('modal-open layout matches visual baseline', async ({ page }) => {
  await page.goto('/');
  await disableMotion(page);
  await page.getByRole('button', { name: 'Open demo flow' }).click();
  await expect(page.getByRole('dialog', { name: 'Request a release check' })).toBeVisible();

  await expect(page).toHaveScreenshot('modal-open.png', {
    fullPage: true,
    animations: 'disabled',
  });
});