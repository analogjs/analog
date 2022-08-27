import 'zone.js/dist/zone.js';
import { renderApplication } from '@angular/platform-server';
import type { ɵComponentType } from '@angular/core';

function check(
  Component: ɵComponentType<unknown>,
  _props: Record<string, unknown>,
  _children: unknown
) {
  return !!Component['ɵcmp'];
}

async function renderToStaticMarkup(
  Component: ɵComponentType<unknown>,
  _props: Record<string, unknown>,
  _children: unknown
) {
  const appId = getSelector(Component);
  const document = `<${appId}></${appId}>`;

  const html = await renderApplication(Component, {
    appId,
    document,
  });

  return { html };
}

function getSelector(cmp: ɵComponentType<any>) {
  return (cmp['ɵcmp'] as any).selectors[0][0];
}

export default {
  check,
  renderToStaticMarkup,
};
