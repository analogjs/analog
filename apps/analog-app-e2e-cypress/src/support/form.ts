export const getControlByLabel = (label: string | RegExp) => {
  return cy
    .contains('label', label)
    .invoke('attr', 'for')
    .then((id) => cy.get(`#${id}`));
};
