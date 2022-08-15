import * as productDetails from '../support/product-details.po';
import * as productList from '../support/product-list.po';

describe('Products', () => {
  beforeEach(() => cy.visit('/'));

  it(`When the "Share" button is clicked
    Then the share dialog is opened`, () => {
    productList.getShareButtonByName(/phone mini/i).click();

    cy.on('window:alert', (alert) => {
      expect(alert).to.contain(/the product has been shared!/i);
    });
  });

  it(`When the "Notify Me" button is clicked
    Then the customer subscribes to product sale notifications`, () => {
    productList.getNotifyButtonByName(/phone xl/i).click();

    cy.on('window:alert', (alert) => {
      expect(alert).to.contain(
        /you will be notified when the product goes on sale/i
      );
    });
  });

  it(`Given the user has navigated to a product's details
    Then the price is visible`, () => {
    productDetails.navigateToByName(/phone standard/i);

    productDetails.getPrice().contains('$299.00').should('be.visible');
  });

  it(`Given the user has navigated to a product's details
    When the "Buy" button is clicked
    Then the product is added to the cart`, () => {
    productDetails.navigateToByName(/phone mini/i);

    productDetails.getBuyButton().click();

    cy.on('window:alert', (alert) => {
      expect(alert).to.contain(/your product has been added to the cart!/i);
    });
  });
});
