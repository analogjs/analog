import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createServer,
  normalizePath,
  type Connect,
  type ViteDevServer,
} from 'vite';

import { createAngularBuildContext } from './angular-build-context.js';
import { composeAngularPlugins } from './compose-angular-plugins.js';
import {
  liveReloadPlugin,
  type ComponentUpdates,
} from './live-reload-plugin.js';

function createMockResponse() {
  const headers = new Map<string, string>();
  let body: string | undefined;
  const res = {
    statusCode: 200,
    writableEnded: false,
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
    end(chunk?: string) {
      body = chunk ?? '';
      this.writableEnded = true;
    },
  };
  return {
    res,
    headers,
    getBody: () => body,
  };
}

function mountMiddleware(
  updates: ComponentUpdates,
  options: {
    moduleGraph?: Map<string, { lastInvalidationTimestamp: number }>;
    proxy?: ViteDevServer['config']['server']['proxy'];
  } = {},
): Connect.HandleFunction {
  const plugin = liveReloadPlugin(updates);
  let middleware: Connect.HandleFunction | undefined;
  const server = {
    config: {
      server: {
        hmr: true,
        proxy: options.proxy,
      },
    },
    moduleGraph: {
      getModuleById(id: string) {
        return options.moduleGraph?.get(id);
      },
    },
    middlewares: {
      use(fn: Connect.HandleFunction) {
        middleware = fn;
      },
    },
  } as unknown as ViteDevServer;

  (plugin.configureServer as (s: ViteDevServer) => void)(server);
  if (!middleware) {
    throw new Error('Expected liveReloadPlugin to register middleware');
  }
  return middleware;
}

describe('liveReloadPlugin middleware', () => {
  const rootDir = '/workspace/host';
  const localFile = normalizePath(
    resolve(rootDir, 'src/app/local.component.ts'),
  );

  it('calls next() for @ng/component requests whose file is unknown to this server', async () => {
    const updates: ComponentUpdates = {
      rootDir,
      classNames: new Map([[localFile, new Set(['LocalComponent'])]]),
      fileEmitter: vi.fn(),
    };
    const middleware = mountMiddleware(updates, {
      moduleGraph: new Map([[localFile, { lastInvalidationTimestamp: 0 }]]),
    });

    const { res } = createMockResponse();
    const next = vi.fn();
    await middleware(
      {
        url: `/remote/src/@ng/component?c=${encodeURIComponent('src/remote.component.ts@RemoteComponent')}&t=1`,
      } as Connect.IncomingMessage,
      res as any,
      next,
    );

    expect(next).toHaveBeenCalledOnce();
    expect(res.writableEnded).toBe(false);
    expect(updates.fileEmitter).not.toHaveBeenCalled();
  });

  it('calls next() when req.url matches a server.proxy rule even if the relative path collides with a host component', async () => {
    const sharedFile = normalizePath(
      resolve(rootDir, 'src/shared.component.ts'),
    );
    const fileEmitter = vi.fn(() => ({
      hmrUpdateCode: 'export default function HostShared_UpdateMetadata() {}',
    }));
    const updates: ComponentUpdates = {
      rootDir,
      classNames: new Map([[sharedFile, new Set(['SharedComponent'])]]),
      fileEmitter,
    };
    const middleware = mountMiddleware(updates, {
      moduleGraph: new Map([[sharedFile, { lastInvalidationTimestamp: 123 }]]),
      proxy: {
        '^/remote/': { target: 'http://localhost:4360', ws: true },
        '/other-remote': 'http://localhost:4361',
      },
    });

    for (const prefix of ['/remote', '/other-remote']) {
      const { res } = createMockResponse();
      const next = vi.fn();
      await middleware(
        {
          url: `${prefix}/src/@ng/component?c=${encodeURIComponent('src/shared.component.ts@SharedComponent')}&t=1`,
        } as Connect.IncomingMessage,
        res as any,
        next,
      );

      expect(next).toHaveBeenCalledOnce();
      expect(res.writableEnded).toBe(false);
    }

    expect(fileEmitter).not.toHaveBeenCalled();
  });

  it('returns an empty 200 without calling next() for known local components prior to invalidation', async () => {
    // Covers both ngtsc (classNames populated) and ngp (only moduleGraph populated on initial load).
    for (const classNames of [
      new Map([[localFile, new Set(['LocalComponent'])]]),
      new Map<string, Set<string>>(),
    ]) {
      const updates: ComponentUpdates = {
        rootDir,
        classNames,
        fileEmitter: vi.fn(),
      };
      const middleware = mountMiddleware(updates, {
        moduleGraph: new Map([[localFile, { lastInvalidationTimestamp: 0 }]]),
      });

      const { res, headers, getBody } = createMockResponse();
      const next = vi.fn();
      await middleware(
        {
          url: `/src/app/@ng/component?c=${encodeURIComponent('src/app/local.component.ts@LocalComponent')}&t=1`,
        } as Connect.IncomingMessage,
        res as any,
        next,
      );

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
      expect(headers.get('content-type')).toBe('text/javascript');
      expect(getBody()).toBe('');
      expect(updates.fileEmitter).not.toHaveBeenCalled();
    }
  });

  it('serves the matching class update for invalidated multi-component files', async () => {
    const columnsFile = normalizePath(resolve(rootDir, 'src/columns.ts'));
    const codeByClass = new Map([
      ['DateColumn', 'export default function DateColumn_UpdateMetadata() {}'],
      [
        'ResizableDateColumn',
        'export default function ResizableDateColumn_UpdateMetadata() {}',
      ],
    ]);
    const updates: ComponentUpdates = {
      rootDir,
      classNames: new Map([
        [columnsFile, new Set(['DateColumn', 'ResizableDateColumn'])],
      ]),
      fileEmitter: (file, className) =>
        file === columnsFile
          ? { hmrUpdateCode: codeByClass.get(className) }
          : undefined,
    };
    const middleware = mountMiddleware(updates, {
      moduleGraph: new Map([[columnsFile, { lastInvalidationTimestamp: 123 }]]),
    });

    for (const [className, expectedCode] of codeByClass) {
      const { res, getBody } = createMockResponse();
      const next = vi.fn();
      await middleware(
        {
          url: `/src/@ng/component?c=${encodeURIComponent(`src/columns.ts@${className}`)}&t=1`,
        } as Connect.IncomingMessage,
        res as any,
        next,
      );

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
      expect(getBody()).toBe(expectedCode);
    }
  });
});

describe('liveReload ngtsc integration', () => {
  const originalNodeEnv = process.env['NODE_ENV'];
  const originalVitest = process.env['VITEST'];
  const originalCwd = process.cwd();
  const tempDirs: string[] = [];
  const servers: ViteDevServer[] = [];

  afterEach(async () => {
    while (servers.length > 0) {
      await servers.pop()!.close();
    }
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) {
      delete process.env['NODE_ENV'];
    } else {
      process.env['NODE_ENV'] = originalNodeEnv;
    }
    if (originalVitest === undefined) {
      delete process.env['VITEST'];
    } else {
      process.env['VITEST'] = originalVitest;
    }
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  function createFixture(files: Record<string, string>): string {
    const tmpBase = resolve(import.meta.dirname, '../../../../tmp');
    mkdirSync(tmpBase, { recursive: true });
    const dir = mkdtempSync(join(tmpBase, 'analog-live-reload-it-'));
    tempDirs.push(dir);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(
      join(dir, 'tsconfig.app.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ES2022',
          moduleResolution: 'bundler',
          experimentalDecorators: true,
          strict: false,
          skipLibCheck: true,
          lib: ['ES2022', 'DOM'],
        },
        include: ['src/**/*.ts'],
      }),
    );
    for (const [relPath, content] of Object.entries(files)) {
      writeFileSync(join(dir, relPath), content);
    }
    return dir;
  }

  async function startNgtscServer(
    root: string,
    extra: {
      base?: string;
      proxy?: ViteDevServer['config']['server']['proxy'];
    } = {},
  ): Promise<{ server: ViteDevServer; origin: string }> {
    process.env['NODE_ENV'] = 'development';
    delete process.env['VITEST'];
    process.chdir(root);

    const ctx = createAngularBuildContext({
      workspaceRoot: root,
      tsconfig: join(root, 'tsconfig.app.json'),
      jit: false,
      liveReload: true,
    });
    const server = await createServer({
      root,
      base: extra.base,
      configFile: false,
      logLevel: 'silent',
      server: { port: 0, proxy: extra.proxy },
      plugins: composeAngularPlugins(ctx),
    });
    await server.listen();
    servers.push(server);
    const addr = server.httpServer!.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('Expected TCP server address');
    }
    // The address the server bound, not `localhost`: Vite may bind `localhost`
    // to ::1 while `fetch('http://localhost:…')` connects to 127.0.0.1.
    const host = addr.family === 'IPv6' ? `[${addr.address}]` : addr.address;
    return { server, origin: `http://${host}:${addr.port}` };
  }

  it('serves per-component HMR updates and broadcasts updates for every component in a multi-component file', async () => {
    const root = createFixture({
      'src/columns.ts': `
        import { Component, Directive } from '@angular/core';
        import { DatePipe } from '@angular/common';

        @Directive({ selector: '[acmeResizable]', standalone: true })
        export class Resizable {}

        const columnImports = [DatePipe];

        @Component({
          selector: 'acme-date-column',
          standalone: true,
          template: '<div>Date v1</div>',
          imports: columnImports,
        })
        export class DateColumn {}

        @Component({
          selector: 'acme-resizable-date-column',
          standalone: true,
          template: '<div>Resizable v1</div>',
          imports: [...columnImports, Resizable],
        })
        export class ResizableDateColumn extends DateColumn {}
      `,
      'src/trailing-class.ts': `
        import { Component } from '@angular/core';

        @Component({
          selector: 'acme-first',
          standalone: true,
          template: '<div>First v1</div>',
        })
        export class FirstComponent {}

        export class PlainHelper {
          value = 1;
        }
      `,
    });

    const { server, origin } = await startNgtscServer(root);
    const sentComponentIds = new Set<string>();
    const origSend = server.ws.send.bind(server.ws);
    server.ws.send = ((...args: Parameters<typeof server.ws.send>) => {
      if (args[0] === 'angular:component-update' && args[1]?.id) {
        sentComponentIds.add(decodeURIComponent(args[1].id));
      }
      return origSend(...args);
    }) as typeof server.ws.send;

    await server.transformRequest('/src/columns.ts');
    const columnsFile = join(root, 'src/columns.ts');
    writeFileSync(
      columnsFile,
      `
        import { Component, Directive } from '@angular/core';
        import { DatePipe } from '@angular/common';

        @Directive({ selector: '[acmeResizable]', standalone: true })
        export class Resizable {}

        const columnImports = [DatePipe];

        @Component({
          selector: 'acme-date-column',
          standalone: true,
          template: '<div>Date v2</div>',
          imports: columnImports,
        })
        export class DateColumn {}

        @Component({
          selector: 'acme-resizable-date-column',
          standalone: true,
          template: '<div>Resizable v2</div>',
          imports: [...columnImports, Resizable],
        })
        export class ResizableDateColumn extends DateColumn {}
      `,
    );
    await server.watcher.emit('change', columnsFile);
    await new Promise((r) => setTimeout(r, 350));

    expect(sentComponentIds).toContain('src/columns.ts@DateColumn');
    expect(sentComponentIds).toContain('src/columns.ts@ResizableDateColumn');

    const dateRes = await fetch(
      `${origin}/src/@ng/component?c=${encodeURIComponent('src/columns.ts@DateColumn')}&t=1`,
    );
    const dateCode = await dateRes.text();
    expect(dateRes.status).toBe(200);
    expect(dateCode).toContain('function DateColumn_UpdateMetadata');
    expect(dateCode).toContain('Date v2');
    expect(dateCode).not.toContain('ResizableDateColumn_UpdateMetadata');

    const resizableRes = await fetch(
      `${origin}/src/@ng/component?c=${encodeURIComponent('src/columns.ts@ResizableDateColumn')}&t=1`,
    );
    const resizableCode = await resizableRes.text();
    expect(resizableRes.status).toBe(200);
    expect(resizableCode).toContain(
      'function ResizableDateColumn_UpdateMetadata',
    );
    expect(resizableCode).toContain('Resizable v2');

    // Trailing non-component class must not clobber the earlier component's HMR update
    await server.transformRequest('/src/trailing-class.ts');
    const trailingFile = join(root, 'src/trailing-class.ts');
    writeFileSync(
      trailingFile,
      `
        import { Component } from '@angular/core';

        @Component({
          selector: 'acme-first',
          standalone: true,
          template: '<div>First v2</div>',
        })
        export class FirstComponent {}

        export class PlainHelper {
          value = 1;
        }
      `,
    );
    await server.watcher.emit('change', trailingFile);
    await new Promise((r) => setTimeout(r, 350));

    const trailingRes = await fetch(
      `${origin}/src/@ng/component?c=${encodeURIComponent('src/trailing-class.ts@FirstComponent')}&t=1`,
    );
    const trailingCode = await trailingRes.text();
    expect(trailingRes.status).toBe(200);
    expect(trailingCode).toContain('function FirstComponent_UpdateMetadata');
    expect(trailingCode).toContain('First v2');
  }, 60_000);

  it('proxies @ng/component requests for remote dev servers through Vite server.proxy', async () => {
    const remoteRoot = createFixture({
      'src/remote.component.ts': `
        import { Component } from '@angular/core';
        @Component({ selector: 'app-remote', standalone: true, template: '<p>Remote v1</p>' })
        export class RemoteComponent {}
      `,
      'src/shared.component.ts': `
        import { Component } from '@angular/core';
        @Component({ selector: 'app-remote-shared', standalone: true, template: '<p>Remote Shared v1</p>' })
        export class SharedComponent {}
      `,
    });
    const hostRoot = createFixture({
      'src/shared.component.ts': `
        import { Component } from '@angular/core';
        @Component({ selector: 'app-host-shared', standalone: true, template: '<p>Host Shared v1</p>' })
        export class SharedComponent {}
      `,
    });

    const remote = await startNgtscServer(remoteRoot, { base: '/remote/' });
    const host = await startNgtscServer(hostRoot, {
      proxy: {
        '^/remote/': {
          target: remote.origin,
          ws: true,
        },
      },
    });

    // Load host's colliding component and invalidate it
    await host.server.transformRequest('/src/shared.component.ts');
    const hostSharedFile = join(hostRoot, 'src/shared.component.ts');
    writeFileSync(
      hostSharedFile,
      `
        import { Component } from '@angular/core';
        @Component({ selector: 'app-host-shared', standalone: true, template: '<p>Host Shared v2</p>' })
        export class SharedComponent {}
      `,
    );
    await host.server.watcher.emit('change', hostSharedFile);

    // Load remote components through the host proxy and invalidate them on remote
    const remoteLoad = await fetch(
      `${host.origin}/remote/src/remote.component.ts`,
    );
    expect(remoteLoad.status).toBe(200);
    const remoteSharedLoad = await fetch(
      `${host.origin}/remote/src/shared.component.ts`,
    );
    expect(remoteSharedLoad.status).toBe(200);

    const remoteFile = join(remoteRoot, 'src/remote.component.ts');
    writeFileSync(
      remoteFile,
      `
        import { Component } from '@angular/core';
        @Component({ selector: 'app-remote', standalone: true, template: '<p>Remote v2</p>' })
        export class RemoteComponent {}
      `,
    );
    const remoteSharedFile = join(remoteRoot, 'src/shared.component.ts');
    writeFileSync(
      remoteSharedFile,
      `
        import { Component } from '@angular/core';
        @Component({ selector: 'app-remote-shared', standalone: true, template: '<p>Remote Shared v2</p>' })
        export class SharedComponent {}
      `,
    );
    await remote.server.watcher.emit('change', remoteFile);
    await remote.server.watcher.emit('change', remoteSharedFile);
    await new Promise((r) => setTimeout(r, 400));

    // Unique remote component is forwarded to remote and returns its update
    const proxiedRemote = await fetch(
      `${host.origin}/remote/src/@ng/component?c=${encodeURIComponent('src/remote.component.ts@RemoteComponent')}&t=1`,
    );
    const proxiedRemoteCode = await proxiedRemote.text();
    expect(proxiedRemote.status).toBe(200);
    expect(proxiedRemoteCode).toContain(
      'function RemoteComponent_UpdateMetadata',
    );
    expect(proxiedRemoteCode).toContain('Remote v2');

    // Same relative path in host & remote still forwards to remote (not host's update)
    const proxiedShared = await fetch(
      `${host.origin}/remote/src/@ng/component?c=${encodeURIComponent('src/shared.component.ts@SharedComponent')}&t=1`,
    );
    const proxiedSharedCode = await proxiedShared.text();
    expect(proxiedShared.status).toBe(200);
    expect(proxiedSharedCode).toContain('Remote Shared v2');
    expect(proxiedSharedCode).not.toContain('Host Shared v2');
  }, 60_000);
});
