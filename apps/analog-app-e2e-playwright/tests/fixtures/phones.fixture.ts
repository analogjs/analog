import { test as base } from '@playwright/test';
import { CartPage } from './cart.po';
import { ProductDetailPage } from './products-details.po';
import { ProductsListPage } from './products-list.po';

interface Phone {
  name: string;
  price: string;
}

const phones: Record<'mini' | 'standard' | 'xl', Phone> = {
  mini: {
    name: 'phone mini',
    price: '$699.00',
  },
  standard: {
    name: 'phone standard',
    price: '$299.00',
  },
  xl: {
    name: 'phone xl',
    price: '$799.00',
  },
};

export const test = base.extend<{
  phones: typeof phones;
  productsListPage: ProductsListPage;
  productDetailPage: ProductDetailPage;
  cartPage: CartPage;
  dialogMessage: () => string | undefined;
}>({
  phones: [phones, { auto: true }],
  productsListPage: async ({ page }, use) => {
    const productsPage = new ProductsListPage(page);
    await page.goto('/');
    await productsPage.goto();
    await use(productsPage);
  },
  productDetailPage: async ({ page }, use) => {
    const productDetailPage = new ProductDetailPage(page);
    await use(productDetailPage);
  },
  cartPage: async ({ page }, use) => {
    const cartPage = new CartPage(page);
    await use(cartPage);
  },
  dialogMessage: async ({ page }, use) => {
    let dialogeMessage: string | undefined = undefined;

    page.once('dialog', async (dialog) => {
      dialogeMessage = dialog.message();
      await dialog.accept();
    });

    await use(() => dialogeMessage);
  },
});
