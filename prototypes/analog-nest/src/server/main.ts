import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';

export async function createNestApp(): Promise<NestExpressApplication> {
  // rawBody keeps the original request bytes for Analog's handlers, which
  // read the body after Nest's JSON/urlencoded parsers have consumed it.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  await app.init();
  return app;
}

if (!import.meta.env.DEV) {
  const app = await createNestApp();
  await app.listen(process.env['PORT'] ?? 3000);
}
