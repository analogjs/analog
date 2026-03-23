import { test, expect } from '@playwright/test';
import { phones } from './fixtures/phones';
import { ProductDetailsPage } from './fixtures/product-details.po';
import { ProductListPage } from './fixtures/product-list.po';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('should open share dialog when Share is clicked', async ({ page }) => {
  const productList = new ProductListPage(page);

  let dialogMessage = '';
  page.once('dialog', async (dialog) => {
    dialogMessage = dialog.message();
    await dialog.accept();
  });

  await productList.getShareButtonByName(phones.mini.name).click();
  expect(dialogMessage).toMatch(/has been shared!/i);
});

test('should open notify dialog when Notify Me is clicked', async ({
  page,
}) => {
  const productList = new ProductListPage(page);

  let dialogMessage = '';
  page.once('dialog', async (dialog) => {
    dialogMessage = dialog.message();
    await dialog.accept();
  });

  await productList.getNotifyButtonByName(phones.xl.name).click();
  expect(dialogMessage).toMatch(/you will be notified when .+ goes on sale/i);
});

test('should show price on product details', async ({ page }) => {
  const productDetails = new ProductDetailsPage(page);

  await productDetails.navigateToByName(phones.standard.name);
  await expect(productDetails.getPrice()).toContainText(phones.standard.price);
});

test('should add product to cart when Buy is clicked', async ({ page }) => {
  const productDetails = new ProductDetailsPage(page);

  await productDetails.navigateToByName(phones.mini.name);

  let dialogMessage = '';
  page.once('dialog', async (dialog) => {
    dialogMessage = dialog.message();
    await dialog.accept();
  });

  await productDetails.getBuyButton().click();
  expect(dialogMessage).toMatch(/your product has been added to the cart/i);
});
