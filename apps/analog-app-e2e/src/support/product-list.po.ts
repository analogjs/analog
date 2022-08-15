const getProductByName = (name: string | RegExp) =>
  getHeadingByName(name).closest('div');
export const getHeadingByName = (name: string | RegExp) =>
  cy.get('h3').contains(name);
export const getNotifyButtonByName = (name: string | RegExp) =>
  getProductByName(name)
    .find('button')
    .contains(/notify me/i);
export const getShareButtonByName = (name: string | RegExp) =>
  getProductByName(name).find('button').contains(/share/i);
