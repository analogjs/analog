import { Page } from '@playwright/test';

export class ProductDetailsPage {
  constructor(readonly page: Page) {}

  async navigateToByName(name: RegExp) {
    await this.page.getByRole('link', { name }).click();
    await this.page
      .getByRole('heading', { name: /product details/i, level: 1 })
      .waitFor();
  }

  getBuyButton() {
    return this.page.getByRole('button', { name: /buy/i });
  }

  getPrice() {
    return this.page.locator('.badge-primary.badge-lg');
  }
}
