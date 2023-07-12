export const verifyTitle = () => cy.get('h1').contains(/our locations/i);
export const getLocationName = () => cy.get('h2');
export const changeLocation = (newLocationName: string | RegExp) =>
  cy.contains('a', newLocationName).click();
