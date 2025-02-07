import { chromium, Browser, Page, JSHandle } from 'playwright';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  describe,
} from 'vitest';
import { CartPage } from './fixtures/cart.po';
import { allPhones, phones } from './fixtures/phones';
import { ProductDetailPage } from './fixtures/products-details.po';
import { ProductsListPage } from './fixtures/products-list.po';

let browser: Browser;
let page: Page;

interface CartTestContext {
  productsListPage: ProductsListPage;
  productDetailPage: ProductDetailPage;
  cartPage: CartPage;
}

beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});
beforeEach<CartTestContext>(async (ctx) => {
  page = await browser.newPage({
    baseURL: 'http://localhost:3000',
  });
  await page.goto('/');
  ctx.productsListPage = new ProductsListPage(page);
  ctx.productDetailPage = new ProductDetailPage(page);
  ctx.cartPage = new CartPage(page);
});
afterEach(async () => {
  await page.close();
});

const buyPhoneByName = async ({
  name,
  productDetailPage,
  productsListPage,
}: {
  name: string;
  productDetailPage: ProductDetailPage;
  productsListPage: ProductsListPage;
}) => {
  await productsListPage.navigateTo();
  await productsListPage.navigateToDetail(name);
  await productDetailPage.getBuyButton().click();
};

describe('Cart', () => {
  test<CartTestContext>(`Given the user has added a phone to the cart
    Then the price is visible in a cart item`, async ({
    cartPage,
    productDetailPage,
    productsListPage,
  }) => {
    const phone = phones.mini;
    await buyPhoneByName({
      name: phone.name,
      productDetailPage,
      productsListPage,
    });
    await cartPage.navigateTo();
    expect(
      await cartPage.getPriceByName(phone.name, phone.price).elementHandle(),
    ).toBeTruthy();
  });

  test<CartTestContext>(`Given the user has added all phones to the cart
      Then the prices are visible in the cart`, async ({
    cartPage,
    productDetailPage,
    productsListPage,
  }) => {
    for (const phone of allPhones) {
      await buyPhoneByName({
        name: phone.name,
        productDetailPage,
        productsListPage,
      });
    }

    await cartPage.navigateTo();

    for (const phone of allPhones) {
      expect(
        await cartPage.getPriceByName(phone.name, phone.price).elementHandle(),
      ).toBeTruthy();
    }

    expect(await cartPage.cartItems().elementHandles()).toHaveLength(
      allPhones.length,
    );
  });

  test<CartTestContext>(`Given the user has added a phone to the cart
      And the user has filled in their name
      And the user has filled in their address
      When the "Purchase" button is clicked
      Then the order is submitted
      And the cart is cleared`, async ({
    cartPage,
    productDetailPage,
    productsListPage,
  }) => {
    let message: JSHandle<unknown>[] = [];
    page.on('console', (log) => {
      if (log.type() === 'warning') {
        message = log.args();
      }
    });

    const name = 'Wallace and Gromit';
    const address = '62 West Wallaby Street, Wigan, Lancashire';
    await buyPhoneByName({
      name: phones.xl.name,
      productDetailPage,
      productsListPage,
    });
    await cartPage.navigateTo();
    await cartPage.typeName(name);
    await cartPage.typeAddress(address);

    await cartPage.purchaseOrder();

    expect(await message[0].evaluate((p) => p)).toMatch(
      /your order has been submitted/i,
    );
    expect(await message[1].evaluate((p) => p)).toEqual({ name, address });
    expect(await cartPage.cartItems().elementHandles()).toHaveLength(0);
  });
});
