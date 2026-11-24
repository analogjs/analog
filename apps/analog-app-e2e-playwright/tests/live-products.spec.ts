import { chromium, Browser, Page } from 'playwright';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'vitest';

import { phones } from './fixtures/phones';
import { ProductsListPage } from './fixtures/products-list.po';

let browser: Browser;
let page: Page;
const baseURL = 'http://localhost:43000';

interface LiveProductsTestContext {
  productsListPage: ProductsListPage;
}

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
});

beforeEach<LiveProductsTestContext>(async (ctx) => {
  page = await browser.newPage({
    baseURL,
  });
  await page.goto('/');
  ctx.productsListPage = new ProductsListPage(page);
});

afterEach(async () => {
  await page.close();
});

describe('Live products home page', () => {
  test<LiveProductsTestContext>('shows the live products and SSE service dashboards', async ({
    productsListPage,
  }) => {
    const liveProductsText =
      (await productsListPage.getLiveProductsServiceCard().textContent()) ?? '';
    expect(liveProductsText).toMatch(/Polling:\s+active/i);
    expect(liveProductsText).toMatch(/Refreshes:\s+\d+/i);

    const liveServicesText =
      (await productsListPage.getLiveServicesServiceCard().textContent()) ?? '';
    expect(liveServicesText).toMatch(/Polling:\s+active/i);
    expect(liveServicesText).toMatch(/Refreshes:\s+\d+/i);

    await expect
      .poll(
        async () =>
          (await productsListPage.getProductsSseServiceCard().textContent()) ??
          '',
      )
      .toMatch(/Status:\s+(connecting|open)/i);
    expect(
      (await productsListPage.getProductsSseServiceCard().textContent()) ?? '',
    ).toMatch(/Last payload size:\s+\d+/i);

    await expect
      .poll(
        async () =>
          (await productsListPage.getServicesSseServiceCard().textContent()) ??
          '',
      )
      .toMatch(/Status:\s+(connecting|open)/i);
    expect(
      (await productsListPage.getServicesSseServiceCard().textContent()) ?? '',
    ).toMatch(/Last payload size:\s+\d+/i);
  });

  test<LiveProductsTestContext>('filters premium products and sorts by price', async ({
    productsListPage,
  }) => {
    expect((await productsListPage.getSummary().textContent()) ?? '').toMatch(
      /Showing 3 products\./i,
    );
    expect(
      (await productsListPage.getProductNames().first().textContent()) ?? '',
    ).toMatch(new RegExp(phones.xl.name, 'i'));

    await productsListPage.getPremiumToggleButton().click();
    await expect
      .poll(
        async () => (await productsListPage.getSummary().textContent()) ?? '',
      )
      .toMatch(/Showing 1 product\./i);

    await productsListPage.getPremiumToggleButton().click();
    await expect
      .poll(
        async () => (await productsListPage.getSummary().textContent()) ?? '',
      )
      .toMatch(/Showing 3 products\./i);

    await productsListPage.getSortButton().click();
    expect(
      (await productsListPage.getProductNames().first().textContent()) ?? '',
    ).toMatch(new RegExp(phones.xl.name, 'i'));
    expect(
      (await productsListPage.getProductNames().nth(1).textContent()) ?? '',
    ).toMatch(new RegExp(phones.mini.name, 'i'));
    expect(await productsListPage.getServiceNames().count()).toBeGreaterThan(0);
  });

  test<LiveProductsTestContext>('refreshes products from the toolbar and can reconnect SSE', async ({
    productsListPage,
  }) => {
    const liveProductsCard = productsListPage.getLiveProductsServiceCard();
    const sseCard = productsListPage.getProductsSseServiceCard();
    const liveServicesCard = productsListPage.getLiveServicesServiceCard();
    const servicesSseCard = productsListPage.getServicesSseServiceCard();
    const beforeRefreshCount = Number(
      (await liveProductsCard.textContent())?.match(
        /Refreshes:\s+(\d+)/i,
      )?.[1] ?? '0',
    );
    const beforeServicesRefreshCount = Number(
      (await liveServicesCard.textContent())?.match(
        /Refreshes:\s+(\d+)/i,
      )?.[1] ?? '0',
    );

    await productsListPage.getRefreshButton().click();
    await expect
      .poll(async () => {
        const text = await liveProductsCard.textContent();
        return Number(text?.match(/Refreshes:\s+(\d+)/i)?.[1] ?? '0');
      })
      .toBeGreaterThan(beforeRefreshCount);
    await expect
      .poll(async () => (await liveProductsCard.textContent()) ?? '')
      .toMatch(/Last refresh reason:\s+manual/i);

    await productsListPage.getReconnectSseButton().click();
    await expect
      .poll(async () => (await sseCard.textContent()) ?? '')
      .toMatch(/Status:\s+(connecting|open)/i);

    await productsListPage.getRefreshServicesButton().click();
    await expect
      .poll(async () => {
        const text = await liveServicesCard.textContent();
        return Number(text?.match(/Refreshes:\s+(\d+)/i)?.[1] ?? '0');
      })
      .toBeGreaterThan(beforeServicesRefreshCount);
    await expect
      .poll(async () => (await liveServicesCard.textContent()) ?? '')
      .toMatch(/Last refresh reason:\s+manual/i);

    await productsListPage.getReconnectServicesSseButton().click();
    await expect
      .poll(async () => (await servicesSseCard.textContent()) ?? '')
      .toMatch(/Status:\s+(connecting|open)/i);
  });
});
