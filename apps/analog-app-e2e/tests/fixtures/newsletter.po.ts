import { Page } from '@playwright/test';

export class NewsletterPage {
  constructor(readonly page: Page) {}

  async typeEmail(email: string) {
    await this.page.locator('input[name="email"]').fill(email);
  }

  async submit() {
    await this.page.getByRole('button', { name: /submit/i }).click();
  }

  getSubmitMessage() {
    return this.page.locator('#signup-message');
  }
}
