export const getTitle = () => cy.contains('h1', /my store/i);

export const get404Title = () => cy.contains('h2', /page not found/i);

export const getNested404Title = () =>
  cy.contains('h2', /shipping page not found/i);
