import { Page } from '@playwright/test';

export class CartPage {
  constructor(readonly page: Page) {}

  async navigateTo() {
    await this.page.getByRole('link', { name: /cart/i }).click();
  }

  getItems() {
    return this.page.locator('.list-row');
  }

  getPriceByName(name: RegExp) {
    return this.page
      .locator('.list-row', { hasText: name })
      .locator('.badge-primary');
  }

  async typeName(name: string) {
    await this.page.locator('#name').fill(name);
  }

  async typeAddress(address: string) {
    await this.page.locator('#address').fill(address);
  }

  async purchaseOrder() {
    await this.page.getByRole('button', { name: /purchase/i }).click();
  }
}
