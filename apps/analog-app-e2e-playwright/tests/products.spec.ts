import { chromium, Browser, Page } from 'playwright';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  describe,
} from 'vitest';
import { phones } from './fixtures/phones';
import { ProductDetailPage } from './fixtures/products-details.po';
import { ProductsListPage } from './fixtures/products-list.po';

let browser: Browser;
let page: Page;

interface ProductsTestContext {
  productsListPage: ProductsListPage;
  productDetailPage: ProductDetailPage;
}

beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});
beforeEach<ProductsTestContext>(async (ctx) => {
  page = await browser.newPage({
    baseURL: 'http://localhost:3000',
  });
  await page.goto('/');
  ctx.productsListPage = new ProductsListPage(page);
  ctx.productDetailPage = new ProductDetailPage(page);
});
afterEach(async () => {
  await page.close();
});

describe('Products', () => {
  test<ProductsTestContext>(`When the "Share" button is clicked
    Then the share dialog is opened`, async ({ productsListPage }) => {
    let dialogMessage: string | undefined = undefined;
    page.once('dialog', async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });

    await productsListPage.getShareButtonByName(phones.mini.name).click();
    expect(dialogMessage).toMatch(/the product has been shared!/i);
  });

  test<ProductsTestContext>(`When the "Notify Me" button is clicked
    Then the customer subscribes to product sale notifications`, async ({
    productsListPage,
  }) => {
    let dialogMessage: string | undefined = undefined;
    page.once('dialog', async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });

    await productsListPage.getNotifyButtonByName(phones.xl.name).click();
    expect(dialogMessage).toMatch(
      /you will be notified when the product goes on sale/i,
    );
  });

  test<ProductsTestContext>(`Given the user has navigated to a product's details
    Then the price is visible`, async ({
    productsListPage,
    productDetailPage,
  }) => {
    const phone = phones.standard;
    await productsListPage.navigateToDetail(phone.name);
    expect(await productDetailPage.getPrice().textContent()).toContain(
      phone.price,
    );
  });

  test<ProductsTestContext>(`Given the user has navigated to a product's details
    When the "Buy" button is clicked
    Then the product is added to the cart`, async ({
    productsListPage,
    productDetailPage,
  }) => {
    let dialogMessage: string | undefined = undefined;
    page.once('dialog', async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });

    await productsListPage.navigateToDetail(phones.mini.name);
    await productDetailPage.getBuyButton().click();
    expect(dialogMessage).toMatch(/your product has been added to the cart/i);
  });
});
