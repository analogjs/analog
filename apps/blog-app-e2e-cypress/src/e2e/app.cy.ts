describe('blog-app', () => {
  beforeEach(() => cy.visit('/'));

  it('should redirect us to /blog', () => {
    cy.url().should('be.equal', `${Cypress.config('baseUrl')}/blog`);
  });
  it('should serve up HTML for pre-rendered markdown route', () => {
    cy.visit('/blog/2022-12-27-my-first-post');
    cy.get('h1').should('contain', 'My First Post');
  });
  it('should serve up XML for pre-rendered XML route from vite.config at /api/rss.xml', () => {
    cy.request('/api/rss.xml')
      .its('headers')
      .its('content-type')
      .should('include', 'application/xml');
  });
});
