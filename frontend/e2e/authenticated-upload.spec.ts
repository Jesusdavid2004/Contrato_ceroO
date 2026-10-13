import { expect, test } from '@playwright/test';
import { mockContractApi, registerTestUser, uploadFixtureContract } from './support/mock-api';

test('redirects unauthenticated users and recovers from a failed upload', async ({ page }) => {
  const api = await mockContractApi(page, { failFirstUpload: true });
  await registerTestUser(page);
  await uploadFixtureContract(page);

  await expect(page.getByText('The request could not be completed.')).toBeVisible();
  expect(api.uploadCount).toBe(1);

  await uploadFixtureContract(page);
  await expect(page.getByText('This agreement renews automatically every year unless notice is given.')).toBeVisible();
  expect(api.uploadCount).toBe(2);
  expect(api.contractWasReadBack).toBe(true);
});
