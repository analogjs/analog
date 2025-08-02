import 'zone.js';

import { applicationConfig, type Preview } from '@analogjs/storybook-angular';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

// compodoc configuration
import { setCompodocJson } from '@storybook/addon-docs/angular';
import docJson from '../documentation.json';

setCompodocJson(docJson);

const preview: Preview = {
  decorators: [
    applicationConfig({
      providers: [provideNoopAnimations()],
    }),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
