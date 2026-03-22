describe('newsletter signup', () => {
  it('submits an email address', () => {
    const email = 'test@example.com';

    cy.visit('/newsletter');
    cy.get('input[name="email"]').type(email);
    cy.contains('button', 'Submit').click();

    cy.get('#signup-message').should('contain', email);
  });
});
