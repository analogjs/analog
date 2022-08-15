import { getGreeting } from '../support/app.po';

describe('analog-app', () => {
  beforeEach(() => cy.visit('/'));

  it('should display welcome message', () => {
    getGreeting().contains('My Store');
  });
});
