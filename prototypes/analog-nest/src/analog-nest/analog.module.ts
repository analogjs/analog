import { Module, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost, ModuleRef } from '@nestjs/core';
import {
  createServerFnAppInjector,
  createServerFnEventHandler,
} from '@analogjs/router/server';
import type { ServerContext } from '@analogjs/router/tokens';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import {
  createApp,
  createRouter,
  defineEventHandler,
  type EventHandler,
  getRequestURL,
  toNodeListener,
} from 'h3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { $fetch } from 'ofetch';
import type { ViteDevServer } from 'vite';

import { config } from '../app/app.config.server';
import renderPage from '../main.server';
import { setNestApp } from './nest-app';

type PageEndpointModule = {
  load?: (ctx: unknown) => unknown;
  action?: (ctx: unknown) => unknown;
};

// The page endpoints and server-function modules the Nitro build discovers
// with getPageHandlers/getServerFnHandlers. A package would generate these in
// a virtual module; inside the app, import.meta.glob does the same job.
const pageEndpoints = import.meta.glob<PageEndpointModule>(
  '/src/app/pages/**/*.server.ts',
);
import.meta.glob('/src/app/**/*.server.ts', { eager: true });

const SERVER_FN_PREFIX = '/_analog/fn/';
const PAGE_ENDPOINT_PREFIX = '/api/_analog/pages/';
const VITE_SERVER = Symbol.for('analog.nest.vite');

@Module({})
export class AnalogModule implements OnModuleInit {
  constructor(
    moduleRef: ModuleRef,
    private readonly adapterHost: HttpAdapterHost,
  ) {
    setNestApp(moduleRef);
  }

  // Runs after Nest registers every controller route and before it installs
  // its 404 handler, so Analog only sees requests no controller claimed.
  onModuleInit(): void {
    const app = this.adapterHost.httpAdapter.getInstance<express.Express>();

    if (!import.meta.env.DEV) {
      app.use(express.static(clientDir(), { index: false }));
    }

    const analogEndpoints = toNodeListener(createAnalogApp());
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (
        req.path.startsWith(SERVER_FN_PREFIX) ||
        req.path.startsWith(PAGE_ENDPOINT_PREFIX)
      ) {
        void analogEndpoints(req, res);
        return;
      }
      next();
    });

    app.get(
      /^(?!\/api\/).*/,
      (req: Request, res: Response, next: NextFunction) =>
        this.render(req, res).catch(next),
    );
  }

  private async render(req: Request, res: Response): Promise<void> {
    const url = req.originalUrl;
    const html = await renderPage(url, await indexHtml(url), {
      req,
      res,
      fetch: serverFetch(`${req.protocol}://${req.get('host')}`),
    } as ServerContext);
    res.type('html').send(html);
  }
}

function createAnalogApp() {
  const router = createRouter();
  router.use(
    `${SERVER_FN_PREFIX}:id`,
    createServerFnEventHandler(createServerFnAppInjector(config)),
  );
  for (const [file, importEndpoint] of Object.entries(pageEndpoints)) {
    router.use(toPageEndpointRoute(file), pageEndpointHandler(importEndpoint));
  }
  return createApp().use(router);
}

function pageEndpointHandler(
  importEndpoint: () => Promise<PageEndpointModule>,
): EventHandler {
  return defineEventHandler(async (event) => {
    const endpoint = await importEndpoint();
    const handler = event.method === 'GET' ? endpoint.load : endpoint.action;
    return (
      (await handler?.({
        params: event.context.params,
        req: event.node.req,
        res: event.node.res,
        fetch: serverFetch(getRequestURL(event).origin),
        event,
      })) ?? {}
    );
  });
}

/**
 * An ofetch instance for same-origin calls, as Nitro provides: page endpoints
 * get it as `fetch`, and the router's SSR interceptor uses its `.raw()` to
 * write responses into TransferState.
 */
function serverFetch(origin: string) {
  return $fetch.create({ baseURL: origin });
}

/** Same mapping as getPageHandlers in @analogjs/platform. */
function toPageEndpointRoute(file: string): string {
  const route = file
    .replace(/^(.*?)\/pages/, '/pages')
    .replace(/\.server\.ts$/, '')
    .replace(/\[\.{3}(\w+)\]/g, '**:$1')
    .replace(/\/\(([^/]+)\)/g, '/-$1-')
    .replace(/\[(\w+)\]/g, ':$1')
    .replace(/\./g, '/');
  return `/api/_analog${route}`;
}

function clientDir(): string {
  return fileURLToPath(new URL('../client', import.meta.url));
}

let builtIndexHtml: string | undefined;

async function indexHtml(url: string): Promise<string> {
  if (import.meta.env.DEV) {
    const vite = (globalThis as Record<symbol, ViteDevServer>)[VITE_SERVER];
    const source = readFileSync(`${vite.config.root}/index.html`, 'utf-8');
    return vite.transformIndexHtml(url, source);
  }
  builtIndexHtml ??= readFileSync(`${clientDir()}/index.html`, 'utf-8');
  return builtIndexHtml;
}
