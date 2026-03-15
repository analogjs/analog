import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function createServer() {
  const app = express();
  const resolve = (p) => path.resolve(__dirname, p);

  // @ts-ignore
  app.use((await import('compression')).default());

  app.use(
    // @ts-ignore
    (await import('serve-static')).default(
      resolve('dist/apps/analog-app/client'),
      {
        index: false,
      },
    ),
  );

  app.use(
    '/api',
    (await import(resolve('dist/apps/analog-app/server/server/index.mjs')))
      .listener,
  );

  app.use('*', async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const template = fs.readFileSync(
        path.resolve(__dirname, 'dist/apps/analog-app/client/index.html'),
        'utf-8',
      );

      const render = (
        await import(`${__dirname}/dist/apps/analog-app/ssr/main.server.mjs`)
      )['default'];

      const html = await render(url, template);

      res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    } catch (e) {
      res.end('Error');
      // console.error(e);
    }
  });

  app.listen(3000, () => {
    console.log('http://localhost:3000');
  });
}

createServer();
