import '@angular/platform-server/init';
import 'zone.js/node';
import { renderApplication } from '@angular/platform-server';

import bootstrap from './src/main.server';

export default async function render(url: string, document: string) {
  const html = await renderApplication(bootstrap, {
    document,
    url,
  });

  return html;
}
