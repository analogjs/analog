import { expect } from '@playwright/test';
import { test } from './fixtures/phones.fixture';

test.describe('Products', () => {
  test(`When the "Share" button is clicked
    Then the share dialog is opened`, async ({
    productsListPage,
    phones,
    dialogMessage,
  }) => {
    await productsListPage.getShareButtonByName(phones.mini.name).click();
    expect(dialogMessage()).toMatch(/the product has been shared!/i);
  });

  test(`When the "Notify Me" button is clicked
    Then the customer subscribes to product sale notifications`, async ({
    productsListPage,
    phones,
    dialogMessage,
  }) => {
    await productsListPage.getNotifyButtonByName(phones.xl.name).click();
    expect(dialogMessage()).toMatch(
      /you will be notified when the product goes on sale/i
    );
  });

  test(`Given the user has navigated to a product's details
  Then the price is visible`, async ({
    phones,
    productsListPage,
    productDetailPage,
  }) => {
    const phone = phones.standard;
    await productsListPage.navigateToDetail(phone.name);
    await expect(productDetailPage.getPrice()).toBeVisible();
    await expect(productDetailPage.getPrice()).toHaveText(phone.price);
  });

  test(`Given the user has navigated to a product's details
  When the "Buy" button is clicked
  Then the product is added to the cart`, async ({
    phones,
    productsListPage,
    productDetailPage,
    dialogMessage,
  }) => {
    await productsListPage.navigateToDetail(phones.mini.name);
    await productDetailPage.getBuyButton().click();
    expect(dialogMessage()).toMatch(/your product has been added to the cart/i);
  });
});
