import * as app from './app.po';

const getProductByName = (name: string | RegExp) =>
  getHeadingByName(name).closest('div');
export const getHeadingByName = (name: string | RegExp) =>
  cy.contains('h3', name);
export const getNotifyButtonByName = (name: string | RegExp) =>
  getProductByName(name)
    .find('button')
    .contains(/notify me/i)
    .closest('button');
export const getShareButtonByName = (name: string | RegExp) =>
  getProductByName(name).find('button').contains(/share/i).closest('button');
export const navigateTo = () => app.getTitle().click();
