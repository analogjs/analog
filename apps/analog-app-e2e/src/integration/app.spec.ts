import * as app from '../support/app.po';

describe('My Store', () => {
  beforeEach(() => cy.visit('/'));

  it(`Given the user has navigated to the home page
    Then the app title is visible`, () => {
    app.getTitle().contains(/my store/i);
  });
});
