import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { fileURLToPath } from 'node:url';
import { toFetchHandler } from 'srvx/node';

import { AppModule } from './app.module';

// Keeps the request body for Analog after Nest's body parsers have run.
const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  rawBody: true,
});

// Vite serves client files in development.
if (!import.meta.env.DEV) {
  const clientDir = fileURLToPath(new URL('../client', import.meta.url));
  app.useStaticAssets(clientDir, { index: false });
}

await app.init();
const server = app.getHttpAdapter().getInstance();

if (!import.meta.env.DEV) {
  await app.listen(process.env['PORT'] ?? 3000);
}

export default {
  fetch: toFetchHandler((req, res) => server(req, res)),
  close: () => app.close(),
};
