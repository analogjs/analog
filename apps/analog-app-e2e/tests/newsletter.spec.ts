import { test, expect } from '@playwright/test';
import { NewsletterPage } from './fixtures/newsletter.po';

test('should sign up for newsletter', async ({ page }) => {
  await page.goto('/newsletter');

  // Wait for Angular hydration — the FormAction directive sets data-state
  // once the directive is live.
  await page.locator('form[data-state]').waitFor({ timeout: 15_000 });

  const newsletter = new NewsletterPage(page);
  const email = 'test@example.com';

  await newsletter.typeEmail(email);
  await newsletter.submit();

  await expect(newsletter.getSubmitMessage()).toContainText(email);
});
