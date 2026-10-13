import { expect, test } from '@playwright/test';
import { mockContractApi, registerTestUser, uploadFixtureContract } from './support/mock-api';

test('uploads a contract, edits and downloads its letter, and switches language and theme', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('lang', 'en');
    localStorage.setItem('cc_theme', 'light');
  });
  const api = await mockContractApi(page);
  await registerTestUser(page);
  await uploadFixtureContract(page);

  await expect(page.getByText('This agreement renews automatically every year unless notice is given.')).toBeVisible();
  await expect(page.getByText('This information is general and is not legal advice.')).toBeVisible();
  expect(api.contractWasReadBack).toBe(true);

  await page.getByRole('button', { name: 'Generate Objection Letter' }).click();
  const letter = page.getByLabel('Editable objection letter text');
  await expect(letter).toContainText('[YOUR NAME]');
  await page.getByLabel('Your name').fill('Alex Rivera');
  await expect(letter).toContainText('Alex Rivera');

  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Your letter changes were saved.')).toBeVisible();
  expect(api.savedLetterContent).toContain('Alex Rivera');

  await page.getByRole('button', { name: 'Copy letter' }).click();
  await expect(page.getByText('Letter copied to clipboard.')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('objection-letter.pdf');
  expect(api.letterWasDownloaded).toBe(true);
  expect(api.savedLetterContent).toContain('Alex Rivera');

  await page.locator('#navbar-lang-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.getByText('Esta información es general y no constituye asesoría legal.')).toBeVisible();
  await page.locator('#navbar-theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
