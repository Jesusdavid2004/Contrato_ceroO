import { expect, test } from '@playwright/test';
import { mockContractApi, registerTestUser, uploadFixtureContract } from './support/mock-api';

test('does not offer a letter when the analyzed contract has no flagged clauses', async ({ page }) => {
  const api = await mockContractApi(page, { flagged: false });
  await registerTestUser(page);
  await uploadFixtureContract(page);

  await expect(page.getByText('Notices will be sent to the contact details provided by each party.')).toBeVisible();
  await expect(page.getByText('No medium- or high-risk clauses were found, so an objection letter is not needed.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate Objection Letter' })).toHaveCount(0);
  expect(api.contractWasReadBack).toBe(true);
  expect(api.generatedLetterCount).toBe(0);
});
