import 'zone.js/dist/zone.js';
import { renderApplication } from '@angular/platform-server';

function check(Component, _props, _children) {
  return !!Component['ɵcmp'];
}

async function renderToStaticMarkup(Component, _props, _children) {
  const appId = getSelector(Component);
  const document = `<${appId}></${appId}>`;

  const html = await renderApplication(Component, {
    appId,
    document
  });

  return { html };
}

function getSelector(cmp) {
  return cmp['ɵcmp'].selectors[0][0];
}

export default {
  check,
  renderToStaticMarkup,
};