import { expect, test } from '@playwright/test';
import { mockContractApi, registerTestUser } from './support/mock-api';

test('loads contract history, opens a result, and deletes a contract', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('lang', 'en');
    localStorage.setItem('cc_theme', 'light');
  });
  const api = await mockContractApi(page, { includeHistory: true });
  await registerTestUser(page);

  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.getByText('Synthetic demo lease')).toBeVisible();
  await expect(page.getByRole('img', { name: '44%' })).toBeVisible();

  await page.getByRole('button', { name: 'Open Synthetic demo lease' }).click();
  await expect(page.getByText('This agreement renews automatically every year unless notice is given.')).toBeVisible();
  expect(api.contractWasReadBack).toBe(true);

  await page.getByRole('link', { name: 'History' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete Synthetic demo lease' }).click();

  await expect(page.getByText('No contracts yet. Upload a contract to see it here.')).toBeVisible();
  expect(api.historyContractWasDeleted).toBe(true);
});
