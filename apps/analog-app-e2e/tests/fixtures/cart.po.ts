import { Page } from '@playwright/test';

export class CartPage {
  constructor(readonly page: Page) {}

  async navigateTo() {
    await this.page.getByRole('link', { name: /checkout/i }).click();
  }

  getItems() {
    return this.page.locator('.cart-item');
  }

  getPriceByName(name: RegExp) {
    return this.page
      .locator('.cart-item', { hasText: name })
      .locator('span')
      .filter({ hasText: /^\$\d+\.\d{2}/ });
  }

  async typeName(name: string) {
    const nameInput = this.page.locator(
      `#${await this.page.locator('label', { hasText: /name/i }).getAttribute('for')}`,
    );
    await nameInput.fill(name);
  }

  async typeAddress(address: string) {
    const addressInput = this.page.locator(
      `#${await this.page.locator('label', { hasText: /address/i }).getAttribute('for')}`,
    );
    await addressInput.fill(address);
  }

  async purchaseOrder() {
    await this.page.getByRole('button', { name: /purchase/i }).click();
  }
}
