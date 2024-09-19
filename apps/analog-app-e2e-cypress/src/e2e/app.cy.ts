import * as app from '../support/app.po';

describe('My Store', () => {
  it(`Given the user has navigated to the home page
    Then the app title is visible`, () => {
    cy.visit('/');
    app.getTitle().contains(/my store/i);
  });

  it('Given the user has navigated an invalid page then the page not found title is visible', () => {
    cy.visit('/bad');
    app.get404Title().contains(/page not found/i);
  });

  it('Given the user has navigated an invalid nested page then the page not found title is visible', () => {
    cy.visit('/shipping/bad');
    app.getNested404Title().contains(/shipping page not found/i);
  });
});
