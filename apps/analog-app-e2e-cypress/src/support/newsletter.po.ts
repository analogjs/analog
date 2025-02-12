export const typeEmail = (email: string) =>
  cy.get('input[name="email"]').type(email);

export const submit = () => cy.contains('button', /submit/i).click();

export const getSubmitMessage = () => cy.get('#signup-message');
