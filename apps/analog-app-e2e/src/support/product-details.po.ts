import * as productList from './product-list.po';

export const getBuyButton = () => cy.get('button').contains(/buy/i);
export const getPrice = () => cy.get('h4');
export const navigateToByName = (name: string | RegExp) =>
  productList.getHeadingByName(name).click();
