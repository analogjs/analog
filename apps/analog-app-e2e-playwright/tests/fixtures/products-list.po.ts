import { Page } from 'playwright';

export class ProductsListPage {
  constructor(readonly page: Page) {}

  async navigateTo() {
    await this.page.locator(`role=heading[level=1] >> text=My Store`).click();
  }

  getShareButtonByName(name: string) {
    return this.page
      .locator(`button:has-text("Share"):below(:text("${name}"))`)
      .first();
  }

  getNotifyButtonByName(name: string) {
    return this.page
      .locator(`button:has-text("Notify"):below(:text("${name}"))`)
      .first();
  }

  async navigateToDetail(name: string) {
    await this.page.locator(`text=${name}`).click();
  }
}
