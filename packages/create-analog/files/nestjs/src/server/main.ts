import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { fileURLToPath } from 'node:url';

import { AppModule } from './app.module';

async function createNestApp() {
  // Keeps the request body for Analog after Nest's body parsers have run.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // Vite serves client files in development.
  if (!import.meta.env.DEV) {
    const clientDir = fileURLToPath(new URL('../client', import.meta.url));
    app.useStaticAssets(clientDir, { index: false });
  }

  return app.init();
}

export async function createApp() {
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
