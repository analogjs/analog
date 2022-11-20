import * as productList from './product-list.po';

const isActiveScreen = () =>
  cy
    .contains('h2', /product details/i)
    .closest('h2')
    .should('be.visible');

export const getBuyButton = () => cy.contains('button', /buy/i);
export const getPrice = () => cy.get('h4');
export const navigateToByName = (name: string | RegExp) => {
  productList.getHeadingByName(name).find('a').click();
  isActiveScreen();
};
