import * as cart from '../support/cart.po';
import * as form from '../support/form';
import { phones } from '../support/phones';
import * as productDetails from '../support/product-details.po';
import * as productList from '../support/product-list.po';

const buyPhoneByName = (name: string | RegExp) => {
  productList.navigateTo();
  productDetails.navigateToByName(name);
  productDetails.getBuyButton().click();
};

describe('Cart', () => {
  beforeEach(() =>
    cy.visit('/', {
      onBeforeLoad: (win) => {
        cy.stub(win.console, 'warn').as('consoleWarn');
      },
    })
  );

  it(`Given the user has added a phone to the cart
    Then the price is visible in a cart item`, () => {
    const phone = phones.mini;
    buyPhoneByName(phone.name);
    cart.navigateTo();

    cart.getPriceByName(phone.name).contains(phone.price);
  });

  it(`Given the user has added all phones to the cart
    Then the prices are visible in the cart`, () => {
    Object.values(phones).forEach((phone) => buyPhoneByName(phone.name));
    cart.navigateTo();

    Object.values(phones).forEach((phone) =>
      cart.getPriceByName(phone.name).contains(phone.price)
    );
  });

  it(`Given the user has added a phone to the cart
      And the user has filled in their name
      And the user has filled in their address
    When the "Purchase" button is clicked
    Then the order is submitted
      And the cart is cleared`, () => {
    const name = 'Wallace and Gromit';
    const address = '62 West Wallaby Street, Wigan, Lancashire';
    buyPhoneByName(phones.xl.name);
    cart.navigateTo();
    form.getControlByLabel(/name/i).type(name);
    form.getControlByLabel(/address/i).type(address);

    cart.purchaseOrder();
    cy.get('@consoleWarn').should(
      'have.been.calledWithMatch',
      /your order has been submitted/i,
      { name, address }
    );
    cart.getItems().should('not.exist');
  });
});
