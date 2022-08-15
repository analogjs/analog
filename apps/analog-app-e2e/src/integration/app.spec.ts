import * as app from '../support/app.po';

describe('analog-app', () => {
  beforeEach(() => cy.visit('/'));

  it('the app title is displayed', () => {
    app.getTitle().contains('My Store');
  });
});
