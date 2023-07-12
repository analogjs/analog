import * as locations from '../support/locations.po';

describe('Locations', () => {
  beforeEach(() => cy.visit('/locations'));

  it(`Given the user has navigated to the locations page
    Then they should be redirected to the /locations/new-york
    Navigating to a different location should then take them to that location
    Using the browser back button should take them to the previous location
    `, () => {
    locations.verifyTitle();
    locations.getLocationName().contains(/new york/i);
    locations.changeLocation(/san francisco/i);
    locations.getLocationName().contains(/san francisco/i);
    locations.changeLocation(/new york/i);
    locations.getLocationName().contains(/new york/i);
    cy.go('back');
    locations.getLocationName().contains(/san francisco/i);
  });
});
