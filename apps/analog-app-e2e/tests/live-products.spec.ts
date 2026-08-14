import { test, expect } from '@playwright/test';
import { phones } from './fixtures/phones';

test.describe('Live products home page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for Angular hydration — polling becomes active after hydration.
    await expect(
      page.locator('.service-card').filter({
        has: page.getByRole('heading', { name: /live products service/i }),
      }),
    ).toContainText(/Polling:\s+active/i, { timeout: 15_000 });
  });

  test('shows the live products and SSE service dashboards', async ({
    page,
  }) => {
    const liveProductsCard = page.locator('.service-card').filter({
      has: page.getByRole('heading', { name: /live products service/i }),
    });
    await expect(liveProductsCard).toContainText(/Polling:\s+active/i);
    await expect(liveProductsCard).toContainText(/Refreshes:\s+\d+/i);

    const liveServicesCard = page.locator('.service-card').filter({
      has: page.getByRole('heading', { name: /live services service/i }),
    });
    await expect(liveServicesCard).toContainText(/Polling:\s+active/i);
    await expect(liveServicesCard).toContainText(/Refreshes:\s+\d+/i);

    const sseCard = page.locator('.service-card').filter({
      has: page.getByRole('heading', { name: /products sse service/i }),
    });
    await expect(sseCard).toContainText(/Status:\s+(connecting|open)/i);
    await expect(sseCard).toContainText(/Last payload size:\s+\d+/i);

    const servicesSseCard = page.locator('.service-card').filter({
      has: page.getByRole('heading', { name: /services sse service/i }),
    });
    await expect(servicesSseCard).toContainText(/Status:\s+(connecting|open)/i);
    await expect(servicesSseCard).toContainText(/Last payload size:\s+\d+/i);
  });

  test('filters premium products and sorts by price', async ({ page }) => {
    const summary = page.locator('.summary').first();
    const productNames = page.locator('.product-card h3 a');
    const premiumToggle = page.getByRole('button', {
      name: /show (premium|all) products/i,
    });
    const sortButton = page.getByRole('button', {
      name: /(sort by highest price|default product order)/i,
    });

    await expect(summary).toContainText(/Showing 3 products\./i);
    await expect(productNames.first()).toContainText(phones.xl.name);

    await premiumToggle.click();
    await expect(summary).toContainText(/Showing 1 product\./i);

    await premiumToggle.click();
    await expect(summary).toContainText(/Showing 3 products\./i);

    await sortButton.click();
    await expect(productNames.first()).toContainText(phones.xl.name);
    await expect(productNames.nth(1)).toContainText(phones.mini.name);
    expect(
      await page.locator('.catalog-grid .product-card h3').count(),
    ).toBeGreaterThan(0);
  });

  test('refreshes products from the toolbar and can reconnect SSE', async ({
    page,
  }) => {
    const liveProductsCard = page.locator('.service-card').filter({
      has: page.getByRole('heading', { name: /live products service/i }),
    });
    const sseCard = page.locator('.service-card').filter({
      has: page.getByRole('heading', { name: /products sse service/i }),
    });

    await page.getByRole('button', { name: /refresh products/i }).click();
    await expect(liveProductsCard).toContainText(
      /Last refresh reason:\s+manual/i,
      { timeout: 10_000 },
    );

    await page.getByRole('button', { name: /reconnect product sse/i }).click();
    await expect(sseCard).toContainText(/Status:\s+(connecting|open)/i);
  });
});
