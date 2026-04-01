import { type RouterFeatures } from '@angular/router';

import { ANALOG_CONTENT_ROUTE_FILES } from './routes';
import { toMarkdownModule } from './markdown-helpers';
import type { RouteExport } from '../../../src/lib/models';
import {
  ANALOG_EXTRA_ROUTE_FILE_SOURCES,
  type ExtraRouteFileSource,
} from '../../../src/lib/route-files';

export function withContentRoutes(): RouterFeatures {
  return {
    ɵkind: 101 as number,
    ɵproviders: [
      {
        provide: ANALOG_EXTRA_ROUTE_FILE_SOURCES,
        multi: true,
        useValue: {
          files: ANALOG_CONTENT_ROUTE_FILES,
          resolveModule: (
            filename: string,
            fileLoader: () => Promise<unknown>,
          ) =>
            filename.endsWith('.md')
              ? toMarkdownModule(fileLoader as () => Promise<string>)
              : (fileLoader as () => Promise<RouteExport>),
        } satisfies ExtraRouteFileSource,
      },
    ],
  };
}
