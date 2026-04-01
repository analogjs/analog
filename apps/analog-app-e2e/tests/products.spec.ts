import { test, expect } from '@playwright/test';
import { phones } from './fixtures/phones';
import { ProductDetailsPage } from './fixtures/product-details.po';
import { ProductListPage } from './fixtures/product-list.po';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('should open share dialog when Share is clicked', async ({ page }) => {
  const productList = new ProductListPage(page);

  const [dialog] = await Promise.all([
    page.waitForEvent('dialog'),
    productList.getShareButtonByName(phones.mini.name).click(),
  ]);

  expect(dialog.message()).toMatch(/the product has been shared!/i);
  await dialog.accept();
});

test('should open notify dialog when Notify Me is clicked', async ({
  page,
}) => {
  const productList = new ProductListPage(page);

  const [dialog] = await Promise.all([
    page.waitForEvent('dialog'),
    productList.getNotifyButtonByName(phones.xl.name).click(),
  ]);

  expect(dialog.message()).toMatch(
    /you will be notified when the product goes on sale/i,
  );
  await dialog.accept();
});

test('should show price on product details', async ({ page }) => {
  const productDetails = new ProductDetailsPage(page);

  await productDetails.navigateToByName(phones.standard.name);
  await expect(productDetails.getPrice()).toContainText(phones.standard.price);
});

test('should add product to cart when Buy is clicked', async ({ page }) => {
  const productDetails = new ProductDetailsPage(page);

  await productDetails.navigateToByName(phones.mini.name);

  const [dialog] = await Promise.all([
    page.waitForEvent('dialog'),
    productDetails.getBuyButton().click(),
  ]);

  expect(dialog.message()).toMatch(/your product has been added to the cart/i);
  await dialog.accept();
});
