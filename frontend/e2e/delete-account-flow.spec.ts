import { expect, test } from '@playwright/test';
import { mockContractApi, registerTestUser } from './support/mock-api';

test('deletes the account after password confirmation', async ({ page }) => {
  const state = await mockContractApi(page);
  await registerTestUser(page);
  await page.getByRole('link', { name: 'Settings' }).click();

  await page.getByRole('button', { name: 'Delete account' }).click();
  await page.locator('#settings-delete-password').fill('StrongPassword123!');
  await page.getByRole('button', { name: 'Delete my account' }).click();

  await page.waitForURL('**/register');
  expect(state.accountWasDeleted).toBe(true);
  await expect(page.locator('#register-name')).toBeVisible();
});
