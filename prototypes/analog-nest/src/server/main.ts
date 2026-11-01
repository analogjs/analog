import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { fileURLToPath } from 'node:url';

import type { AnalogNodeApp } from '../router-server/analog-handler';
import { AppModule } from './app.module';

async function createNestApp(): Promise<NestExpressApplication> {
  // rawBody keeps the original request bytes for Analog's handlers, which
  // read the body after Nest's JSON/urlencoded parsers have consumed it.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  // Vite serves client files in dev. In production they must be registered
  // before init(), so they come ahead of the Analog handler mounted then.
  if (!import.meta.env.DEV) {
    app.useStaticAssets(fileURLToPath(new URL('../client', import.meta.url)), {
      index: false,
    });
  }
  return app.init();
}

/** Used by the dev server, which mounts the app instead of listening. */
export async function createApp(): Promise<AnalogNodeApp> {
  const app = await createNestApp();
  return {
    handle: app.getHttpAdapter().getInstance(),
    close: () => app.close(),
  };
}

if (!import.meta.env.DEV) {
  const app = await createNestApp();
  await app.listen(process.env['PORT'] ?? 3000);
}
