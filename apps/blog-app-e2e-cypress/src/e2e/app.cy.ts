describe('blog-app', () => {
  beforeEach(() => cy.visit('/'));

  it('should redirect us to /blog', () => {
    cy.url().should('be.equal', `${Cypress.config('baseUrl')}/blog`);
  });
});
