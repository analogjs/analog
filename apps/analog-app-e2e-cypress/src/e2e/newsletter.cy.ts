import * as newsletter from '../support/newsletter.po';

describe('Newsletter', () => {
  it(`Given the user has filled in their email
    When the "Submit" button is clicked
    Then the user has sign up for the newsletter`, () => {
    const email = 'someemail@email.com';
    cy.visit('/newsletter');
    newsletter.typeEmail(email);

    newsletter.submit();
    newsletter
      .getSubmitMessage()
      .should('contain.text', `Thanks for signing up, ${email}!`);
  });
});
