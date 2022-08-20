import { Page } from '@playwright/test';

export class CartPage {
  constructor(readonly page: Page) {}

  async navigateTo() {
    await this.page.locator('text=Checkout').click();
  }

  getPriceByName(name: string, price: string) {
    return this.page.locator(`text=${name} ${price}`);
  }

  async purchaseOrder() {
    await this.page.locator('button >> text=/purchase/i').click();
  }

  async typeName(name: string) {
    await this.page.fill('label:has-text("name")', name);
  }

  async typeAddress(address: string) {
    await this.page.fill('label:has-text("address")', address);
  }

  cartItems() {
    return this.page.locator('.cart-item');
  }
}
