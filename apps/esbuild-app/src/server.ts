import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import { createAnalogRequestHandler } from '@analogjs/router/ssr';
import express from 'express';
import { join } from 'node:path';

import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

/**
 * Analog's server surface: global middleware, server functions, page
 * endpoints, API routes, and streamed pages. Everything else falls
 * through to static files and Angular SSR below.
 */
app.use(
  createAnalogRequestHandler({
    config,
    browserDistFolder,
    // Pages opt in with routeMeta.streaming; renderStream needs the
    // root component because it drives the platform itself.
    streaming: { component: AppComponent },
  }),
);

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

/**
 * Start the server if this module is the main entry point.
 * The server listens on the port defined by the `PORT` environment
 * variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url)) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build).
 */
export const reqHandler = createNodeRequestHandler(app);
