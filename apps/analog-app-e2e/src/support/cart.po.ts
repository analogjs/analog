import * as form from './form';

const itemSelector = '.cart-item';

const getItemByName = (name: string | RegExp) =>
  cy.contains(itemSelector, name);

export const getItems = () => cy.get(itemSelector);
export const getPriceByName = (name: string | RegExp) =>
  getItemByName(name)
    .find('span')
    .contains(/^\$\d+\.\d{2}/);
export const navigateTo = () => cy.contains('a', /cart/i).click();
export const purchaseOrder = () => cy.contains('button', /purchase/i).click();
export const typeAddress = (address: string) =>
  form.getControlByLabel(/address/i).type(address);
export const typeName = (name: string) =>
  form.getControlByLabel(/name/i).type(name);
