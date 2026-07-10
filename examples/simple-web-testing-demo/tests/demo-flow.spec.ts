import { expect, test } from '@playwright/test';

test('runs the accessible release check modal flow', async ({ page }) => {
  await page.goto('/');

  const openFlowButton = page.getByRole('button', { name: 'Open demo flow' });
  const dialog = page.getByRole('dialog', { name: 'Request a release check' });
  const testerNameInput = page.getByLabel('Tester name');
  const submitButton = page.getByRole('button', { name: 'Submit check' });

  await openFlowButton.click();
  await expect(dialog).toBeVisible();
  await expect(testerNameInput).toBeFocused();

  await submitButton.click();
  await expect(page.getByRole('alert')).toHaveText('Enter a tester name before submitting.');
  await expect(testerNameInput).toHaveAttribute('aria-invalid', 'true');
  await expect(testerNameInput).toBeFocused();

  await testerNameInput.fill('Ada Release');
  await expect(page.getByRole('alert')).toBeHidden();
  await submitButton.click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status')).toHaveText('Release check requested for Ada Release.');
  await expect(openFlowButton).toBeFocused();

  await openFlowButton.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(openFlowButton).toBeFocused();
});