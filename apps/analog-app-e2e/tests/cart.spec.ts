import { test, expect } from '@playwright/test';
import { allPhones, phones } from './fixtures/phones';
import { CartPage } from './fixtures/cart.po';
import { ProductDetailsPage } from './fixtures/product-details.po';
import { ProductListPage } from './fixtures/product-list.po';
import { Product } from './fixtures/phones';

async function buyPhone(page: import('@playwright/test').Page, phone: Product) {
  const productList = new ProductListPage(page);
  const productDetails = new ProductDetailsPage(page);

  await productList.navigateTo();
  await productDetails.navigateToByName(phone.name);

  page.once('dialog', (dialog) => dialog.accept());
  await productDetails.getBuyButton().click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('should show price in cart after adding a phone', async ({ page }) => {
  await buyPhone(page, phones.mini);

  const cart = new CartPage(page);
  await cart.navigateTo();

  await expect(cart.getPriceByName(phones.mini.name)).toBeVisible();
});

test('should show all prices after adding all phones', async ({ page }) => {
  for (const phone of allPhones) {
    await buyPhone(page, phone);
  }

  const cart = new CartPage(page);
  await cart.navigateTo();

  for (const phone of allPhones) {
    await expect(cart.getPriceByName(phone.name)).toBeVisible();
  }

  await expect(cart.getItems()).toHaveCount(allPhones.length);
});

test('should submit order and clear cart', async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'warning') {
      consoleMessages.push(msg.text());
    }
  });

  await buyPhone(page, phones.xl);

  const cart = new CartPage(page);
  await cart.navigateTo();

  const name = 'Wallace and Gromit';
  const address = '62 West Wallaby Street, Wigan, Lancashire';
  await cart.typeName(name);
  await cart.typeAddress(address);
  await cart.purchaseOrder();

  await page.waitForTimeout(500);

  expect(
    consoleMessages.some((m) => /your order has been submitted/i.test(m)),
  ).toBe(true);
  await expect(cart.getItems()).toHaveCount(0);
});
