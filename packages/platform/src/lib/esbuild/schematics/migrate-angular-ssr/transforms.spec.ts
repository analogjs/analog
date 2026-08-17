import { describe, expect, it } from 'vitest';

import {
  transformAppConfig,
  transformServerConfig,
  transformServerEntry,
} from './transforms';

const APP_CONFIG = `import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideClientHydration(withEventReplay()),
  ],
};
`;

const SERVER_CONFIG = `import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';

const serverConfig: ApplicationConfig = {
  providers: [provideServerRendering(withRoutes(serverRoutes))],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
`;

const SERVER_ENTRY = `import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

if (isMainModule(import.meta.url)) {
  const port = process.env['PORT'] || 4000;
  app.listen(port);
}

export const reqHandler = createNodeRequestHandler(app);
`;

describe('transformAppConfig', () => {
  it('rewrites provideRouter to provideFileRouter(withExtraRoutes(...))', () => {
    const result = transformAppConfig(APP_CONFIG)!;
    expect(result).toContain(
      'provideFileRouter(withExtraRoutes(routes), withComponentInputBinding())',
    );
    expect(result).toContain(
      "import { provideFileRouter, withExtraRoutes } from '@analogjs/router';",
    );
    expect(result).toContain(
      "import { withComponentInputBinding } from '@angular/router';",
    );
    expect(result).not.toContain('provideRouter(');
  });

  it('is idempotent and null without provideRouter', () => {
    const migrated = transformAppConfig(APP_CONFIG)!;
    expect(transformAppConfig(migrated)).toBe(migrated);
    expect(transformAppConfig('export const appConfig = {};')).toBeNull();
  });
});

describe('transformServerConfig', () => {
  it('swaps provideServerRendering for provideAnalogServerRendering', () => {
    const result = transformServerConfig(SERVER_CONFIG)!;
    expect(result).toContain(
      'provideAnalogServerRendering(withRoutes(serverRoutes))',
    );
    expect(result).toContain(
      "import { provideAnalogServerRendering, withRoutes } from '@analogjs/router/ssr';",
    );
    expect(result).not.toContain("from '@angular/ssr';");
  });

  it('is idempotent and null without provideServerRendering', () => {
    const migrated = transformServerConfig(SERVER_CONFIG)!;
    expect(transformServerConfig(migrated)).toBe(migrated);
    expect(transformServerConfig('export const config = {};')).toBeNull();
  });
});

describe('transformServerEntry', () => {
  it('mounts the analog handler ahead of express.static, above its comment', () => {
    const result = transformServerEntry(
      SERVER_ENTRY,
      './app/app.config.server',
    )!;
    expect(result).toContain(
      'app.use(createAnalogRequestHandler({ config }));',
    );
    expect(result).toContain(
      "import { createAnalogRequestHandler } from '@analogjs/router/ssr';",
    );
    expect(result).toContain(
      "import { config } from './app/app.config.server';",
    );
    expect(
      result.indexOf('createAnalogRequestHandler({ config })'),
    ).toBeLessThan(result.indexOf('Serve static files'));
  });

  it('is idempotent and null without an express.static layer', () => {
    const migrated = transformServerEntry(
      SERVER_ENTRY,
      './app/app.config.server',
    )!;
    expect(transformServerEntry(migrated, './app/app.config.server')).toBe(
      migrated,
    );
    expect(
      transformServerEntry('export const reqHandler = handler;', './x'),
    ).toBeNull();
  });
});
