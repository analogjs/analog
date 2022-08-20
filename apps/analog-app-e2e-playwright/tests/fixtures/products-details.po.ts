import { Page } from '@playwright/test';

export class ProductDetailPage {
  constructor(readonly page: Page) {}

  getPrice() {
    return this.page.locator('h4');
  }

  getBuyButton() {
    return this.page.locator('button >> text=/buy/i');
  }
}
