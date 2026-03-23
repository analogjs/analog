import { Page } from '@playwright/test';

export class ProductListPage {
  constructor(readonly page: Page) {}

  async navigateTo() {
    await this.page.getByRole('link', { name: /analog app/i }).click();
  }

  getShareButtonByName(name: RegExp) {
    return this.page
      .getByRole('article')
      .filter({ has: this.page.getByRole('heading', { name, level: 3 }) })
      .getByRole('button', { name: /share/i });
  }

  getNotifyButtonByName(name: RegExp) {
    return this.page
      .getByRole('article')
      .filter({ has: this.page.getByRole('heading', { name, level: 3 }) })
      .getByRole('button', { name: /notify/i });
  }

  async navigateToDetail(name: RegExp) {
    await this.page.getByRole('link', { name }).click();
  }
}
