import { expect, JSHandle } from '@playwright/test';
import { test as base } from './fixtures/phones.fixture';

export const test = base.extend<{
  buyPhoneByName: (name: string) => Promise<void>;
  consoleWarn: () => JSHandle<unknown>[];
}>({
  buyPhoneByName: async ({ productDetailPage, productsListPage }, use) => {
    await use(async (name: string) => {
      await productsListPage.navigateTo();
      await productsListPage.navigateToDetail(name);
      await productDetailPage.getBuyButton().click();
    });
  },
  consoleWarn: async ({ page }, use) => {
    let message: JSHandle<unknown>[];
    page.on('console', (log) => {
      if (log.type() === 'warning') {
        message = log.args();
      }
    });
    await use(() => message);
  },
});

test.describe('Cart', () => {
  test(`Given the user has added a phone to the cart
    Then the price is visible in a cart item`, async ({
    buyPhoneByName,
    phones,
    cartPage,
  }) => {
    const phone = phones.mini;
    await buyPhoneByName(phone.name);
    await cartPage.navigateTo();
    await expect(
      cartPage.getPriceByName(phone.name, phone.price)
    ).toBeVisible();
  });

  test(`Given the user has added all phones to the cart
    Then the prices are visible in the cart`, async ({
    buyPhoneByName,
    phones,
    cartPage,
  }) => {
    const allPhones = Object.values(phones);
    for (const phone of allPhones) {
      await buyPhoneByName(phone.name);
    }

    await cartPage.navigateTo();

    for (const phone of allPhones) {
      await expect(
        cartPage.getPriceByName(phone.name, phone.price)
      ).toBeVisible();
    }
  });

  test(`Given the user has added a phone to the cart
    And the user has filled in their name
    And the user has filled in their address
    When the "Purchase" button is clicked
    Then the order is submitted
    And the cart is cleared`, async ({
    buyPhoneByName,
    phones,
    cartPage,
    consoleWarn,
  }) => {
    const name = 'Wallace and Gromit';
    const address = '62 West Wallaby Street, Wigan, Lancashire';
    await buyPhoneByName(phones.xl.name);
    await cartPage.navigateTo();
    await cartPage.typeName(name);
    await cartPage.typeAddress(address);

    await cartPage.purchaseOrder();

    const message = consoleWarn();
    expect(await message[0].evaluate((p) => p)).toMatch(
      /your order has been submitted/i
    );
    expect(await message[1].evaluate((p) => p)).toEqual({ name, address });

    await expect(cartPage.cartItems()).toBeHidden();
  });
});
