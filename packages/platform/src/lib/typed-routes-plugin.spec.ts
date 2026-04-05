import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { typedRoutes } from './typed-routes-plugin.js';

describe('typedRoutes', () => {
  const tempDirs: string[] = [];
  type PluginCommand = 'build' | 'serve';

  afterEach(() => {
    vi.restoreAllMocks();

    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop() as string, { recursive: true, force: true });
    }
  });

  function createFixture(options?: { skipMainTs?: boolean }): string {
    const root = mkdtempSync(join(tmpdir(), 'analog-typed-routes-'));
    tempDirs.push(root);
    mkdirSync(join(root, 'src/app/pages'), { recursive: true });
    if (!options?.skipMainTs) {
      writeFileSync(
        join(root, 'src/main.ts'),
        `import 'zone.js';\nimport { bootstrapApplication } from '@angular/platform-browser';\n\nbootstrapApplication(AppComponent);\n`,
        'utf-8',
      );
    }
    return root;
  }

  function writeFixtureFile(
    root: string,
    relativePath: string,
    content: string,
  ): void {
    const filePath = join(root, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, 'utf-8');
  }

  function createPlugin(
    root: string,
    options: Parameters<typeof typedRoutes>[0] = {},
    command: PluginCommand = 'build',
  ) {
    const plugin = typedRoutes({
      workspaceRoot: root,
      ...options,
    });

    const configHook = plugin.config;
    if (typeof configHook === 'function') {
      configHook.call({} as never, { root: '.' }, {
        command,
      } as never);
    } else {
      configHook?.handler.call({} as never, { root: '.' }, {
        command,
      } as never);
    }

    return plugin;
  }

  function runBuildStart(plugin: ReturnType<typeof typedRoutes>): void {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const buildStartHook = plugin.buildStart;
    if (typeof buildStartHook === 'function') {
      buildStartHook.call({} as never, {} as never);
    } else {
      buildStartHook?.handler.call({} as never, {} as never);
    }
  }

  function generateRoutesFile(
    root: string,
    options: Parameters<typeof typedRoutes>[0] = {},
    command: PluginCommand = 'build',
  ): string {
    const plugin = createPlugin(root, options, command);
    runBuildStart(plugin);

    return readFileSync(
      join(root, options.outFile ?? 'src/routeTree.gen.ts'),
      'utf-8',
    );
  }

  function createWatcherServer() {
    const listeners: Record<
      'add' | 'change' | 'unlink',
      Array<(path: string) => void>
    > = {
      add: [],
      change: [],
      unlink: [],
    };

    return {
      server: {
        watcher: {
          on(event: 'add' | 'change' | 'unlink', cb: (path: string) => void) {
            listeners[event].push(cb);
          },
        },
      } as never,
      emit(event: 'add' | 'change' | 'unlink', path: string) {
        listeners[event].forEach((cb) => cb(path));
      },
    };
  }

  it('includes the JSON-LD manifest in the generated routes file by default', () => {
    const root = createFixture();
    writeFixtureFile(
      root,
      'src/app/pages/index.page.ts',
      `export const routeMeta = {
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    identifier: 'home-page',
  },
};

export default class HomePage {}
`,
    );
    writeFixtureFile(
      root,
      'src/app/pages/users/[id].page.ts',
      `export default class UserPage {}
`,
    );
    writeFixtureFile(
      root,
      'src/app/pages/users/[id]/settings.page.ts',
      `export default class UserSettingsPage {}
`,
    );

    const output = generateRoutesFile(root);

    expect(output).toContain(
      "import * as routeModule0 from './app/pages/index.page';",
    );
    expect(output).toContain('interface AnalogRouteTable');
    expect(output).toContain('interface AnalogFileRoutesById');
    expect(output).toContain('export const analogRouteTree = {');
    expect(output).toContain("'/': {");
    expect(output).toContain('"/users/[id]/settings"');
    expect(output).toContain('parentId: "/users/[id]"');
    expect(output).toContain('export const routeJsonLdManifest = new Map');
    expect(output).toContain("['/', { routePath: '/',");
  });

  it('produces deterministic output across repeated generations', () => {
    const root = createFixture();
    writeFixtureFile(
      root,
      'src/app/pages/index.page.ts',
      `export default class HomePage {}
`,
    );
    writeFixtureFile(
      root,
      'src/app/pages/users/[id].page.ts',
      `export default class UserPage {}
`,
    );
    writeFixtureFile(
      root,
      'src/app/pages/users/[id]/settings.page.ts',
      `export default class UserSettingsPage {}
`,
    );

    const first = generateRoutesFile(root);
    const second = generateRoutesFile(root);

    expect(first).toBe(second);
  });

  it('writes a single combined routeTree output file', () => {
    const root = createFixture();
    writeFixtureFile(
      root,
      'src/app/pages/index.page.ts',
      `export const routeMeta = {
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
  },
};

export default class HomePage {}
`,
    );

    generateRoutesFile(root);

    expect(existsSync(join(root, 'src/routeTree.gen.ts'))).toBe(true);
    expect(existsSync(join(root, 'src/routes.gen.ts'))).toBe(false);
    expect(existsSync(join(root, '.analog/route-jsonld.gen.ts'))).toBe(false);
  });

  it('omits only the JSON-LD manifest section when jsonLdManifest is false', () => {
    const root = createFixture();
    writeFixtureFile(
      root,
      'src/app/pages/index.page.ts',
      `export const routeMeta = {
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    identifier: 'home-page',
  },
};

export default class HomePage {}
`,
    );
    writeFixtureFile(
      root,
      'src/app/pages/users/[id].page.ts',
      `export default class UserPage {}
`,
    );

    const output = generateRoutesFile(root, { jsonLdManifest: false });

    expect(output).toContain('interface AnalogRouteTable');
    expect(output).toContain('interface AnalogFileRoutesById');
    expect(output).toContain('export const analogRouteTree = {');
    expect(output).toContain("'/': {");
    expect(output).not.toContain('export const routeJsonLdManifest = new Map');
    expect(output).not.toContain(
      "import * as routeModule0 from './app/pages/index.page';",
    );
  });

  it('generates schema-dts typed JSON-LD manifest in the output', () => {
    const root = createFixture();
    writeFixtureFile(
      root,
      'src/app/pages/index.page.ts',
      `export const routeMeta = {
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Home',
  },
};

export default class HomePage {}
`,
    );
    writeFixtureFile(
      root,
      'src/app/pages/about.page.ts',
      `export default class AboutPage {}
`,
    );

    const output = generateRoutesFile(root);

    expect(output).toContain(
      "import type { Graph, Thing, WithContext } from 'schema-dts';",
    );
    expect(output).toContain(
      'export type AnalogJsonLdDocument = WithContext<Thing> | Graph | Array<WithContext<Thing>>;',
    );
    expect(output).toContain('AnalogJsonLdDocument[]');
    expect(output).toContain('export const routeJsonLdManifest = new Map');
  });

  describe('ensureEntryImport', () => {
    it('injects route tree import into src/main.ts when missing', () => {
      const root = createFixture();
      writeFixtureFile(
        root,
        'src/main.ts',
        `import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent);
`,
      );
      writeFixtureFile(
        root,
        'src/app/pages/index.page.ts',
        `export default class HomePage {}
`,
      );

      generateRoutesFile(root, {}, 'serve');

      const mainContent = readFileSync(join(root, 'src/main.ts'), 'utf-8');
      expect(mainContent).toContain("import './routeTree.gen';");
    });

    it('does not duplicate import when already present', () => {
      const root = createFixture();
      writeFixtureFile(
        root,
        'src/main.ts',
        `import 'zone.js';
import './routeTree.gen';
import { bootstrapApplication } from '@angular/platform-browser';

bootstrapApplication(AppComponent);
`,
      );
      writeFixtureFile(
        root,
        'src/app/pages/index.page.ts',
        `export default class HomePage {}
`,
      );

      generateRoutesFile(root, {}, 'serve');

      const mainContent = readFileSync(join(root, 'src/main.ts'), 'utf-8');
      const matches = mainContent.match(/import '\.\/routeTree\.gen'/g);
      expect(matches).toHaveLength(1);
    });

    it('recognises existing import with .ts extension', () => {
      const root = createFixture();
      writeFixtureFile(
        root,
        'src/main.ts',
        `import './routeTree.gen.ts';
import { bootstrapApplication } from '@angular/platform-browser';

bootstrapApplication(AppComponent);
`,
      );
      writeFixtureFile(
        root,
        'src/app/pages/index.page.ts',
        `export default class HomePage {}
`,
      );

      generateRoutesFile(root, {}, 'serve');

      const mainContent = readFileSync(join(root, 'src/main.ts'), 'utf-8');
      const matches = mainContent.match(/routeTree\.gen/g);
      expect(matches).toHaveLength(1);
    });

    it('falls back to src/main.server.ts when src/main.ts is missing', () => {
      const root = createFixture({ skipMainTs: true });
      writeFixtureFile(
        root,
        'src/main.server.ts',
        `import '@angular/platform-server/init';
import { render } from '@analogjs/router/server';

export default render(AppComponent, config);
`,
      );
      writeFixtureFile(
        root,
        'src/app/pages/index.page.ts',
        `export default class HomePage {}
`,
      );

      generateRoutesFile(root, {}, 'serve');

      expect(existsSync(join(root, 'src/main.ts'))).toBe(false);
      const serverContent = readFileSync(
        join(root, 'src/main.server.ts'),
        'utf-8',
      );
      expect(serverContent).toContain("import './routeTree.gen';");
    });

    it('warns when no entry file is found', () => {
      const root = createFixture({ skipMainTs: true });
      const warnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      writeFixtureFile(
        root,
        'src/app/pages/index.page.ts',
        `export default class HomePage {}
`,
      );

      generateRoutesFile(root, {}, 'serve');

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Could not find an entry file'),
      );
    });

    it('computes correct import path for custom outFile', () => {
      const root = createFixture();
      writeFixtureFile(
        root,
        'src/main.ts',
        `import 'zone.js';

bootstrapApplication(AppComponent);
`,
      );
      writeFixtureFile(
        root,
        'src/app/pages/index.page.ts',
        `export default class HomePage {}
`,
      );

      generateRoutesFile(root, { outFile: 'src/generated/routes.ts' }, 'serve');

      const mainContent = readFileSync(join(root, 'src/main.ts'), 'utf-8');
      expect(mainContent).toContain("import './generated/routes';");
    });

    it('inserts import after the last existing import line', () => {
      const root = createFixture();
      writeFixtureFile(
        root,
        'src/main.ts',
        `import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';

const app = bootstrapApplication(AppComponent);
`,
      );
      writeFixtureFile(
        root,
        'src/app/pages/index.page.ts',
        `export default class HomePage {}
`,
      );

      generateRoutesFile(root, {}, 'serve');

      const mainContent = readFileSync(join(root, 'src/main.ts'), 'utf-8');
      const lines = mainContent.split('\n');
      const importIndex = lines.findIndex((l) =>
        l.includes("import './routeTree.gen'"),
      );
      const lastOriginalImport = lines.findIndex((l) =>
        l.includes('bootstrapApplication'),
      );
      expect(importIndex).toBe(lastOriginalImport + 1);
    });

    it('does not mutate app entry files during verify runs', () => {
      const root = createFixture();
      writeFixtureFile(
        root,
        'src/app/pages/index.page.ts',
        `export default class HomePage {}
`,
      );

      generateRoutesFile(root, { verifyOnBuild: false });
      writeFixtureFile(
        root,
        'src/main.ts',
        `import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';

bootstrapApplication(AppComponent);
`,
      );

      const before = readFileSync(join(root, 'src/main.ts'), 'utf-8');
      const plugin = createPlugin(root, { verify: true });

      expect(() => runBuildStart(plugin)).not.toThrow();
      expect(readFileSync(join(root, 'src/main.ts'), 'utf-8')).toBe(before);
    });

    it('does not mutate app entry files during build freshness checks', () => {
      const root = createFixture();
      writeFixtureFile(
        root,
        'src/app/pages/index.page.ts',
        `export default class HomePage {}
`,
      );

      writeFixtureFile(
        root,
        'src/main.ts',
        `import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';

bootstrapApplication(AppComponent);
`,
      );

      const before = readFileSync(join(root, 'src/main.ts'), 'utf-8');
      const plugin = createPlugin(root);

      expect(() => runBuildStart(plugin)).not.toThrow();
      expect(readFileSync(join(root, 'src/main.ts'), 'utf-8')).toBe(before);
    });
  });

  describe('absolute path leak prevention', () => {
    it('does not leak absolute paths for additionalPagesDirs routes', () => {
      const root = createFixture();
      writeFixtureFile(
        root,
        'src/app/pages/index.page.ts',
        `export default class HomePage {}
`,
      );
      writeFixtureFile(
        root,
        'libs/shared/feature/src/pages/example.page.ts',
        `export default class ExamplePage {}
`,
      );

      const output = generateRoutesFile(root, {
        additionalPagesDirs: ['/libs/shared/feature/src/pages'],
      });

      expect(output).not.toContain(root);
      expect(output).toContain("'/example'");
      expect(output).toContain(
        'sourceFile: "/libs/shared/feature/src/pages/example.page.ts"',
      );
    });

    it('does not leak absolute paths for additionalContentDirs files', () => {
      const root = createFixture();
      writeFixtureFile(
        root,
        'src/app/pages/index.page.ts',
        `export default class HomePage {}
`,
      );
      writeFixtureFile(
        root,
        'libs/shared/content/guides/intro.md',
        `---
title: Intro
---
# Intro
`,
      );

      const output = generateRoutesFile(root, {
        additionalContentDirs: ['/libs/shared/content'],
      });

      expect(output).not.toContain(root);
      expect(output).toContain('/guides/intro');
      expect(output).toContain(
        'sourceFile: "/libs/shared/content/guides/intro.md"',
      );
    });

    it('does not leak absolute paths when mixing app and additional dirs', () => {
      const root = createFixture();
      writeFixtureFile(
        root,
        'src/app/pages/index.page.ts',
        `export default class HomePage {}
`,
      );
      writeFixtureFile(
        root,
        'src/app/pages/about.page.ts',
        `export default class AboutPage {}
`,
      );
      writeFixtureFile(
        root,
        'libs/feature/src/pages/dashboard.page.ts',
        `export default class DashboardPage {}
`,
      );
      writeFixtureFile(
        root,
        'libs/content/posts/hello.md',
        `---
title: Hello
---
# Hello
`,
      );

      const output = generateRoutesFile(root, {
        additionalPagesDirs: ['/libs/feature/src/pages'],
        additionalContentDirs: ['/libs/content'],
      });

      expect(output).not.toContain(root);
      expect(output).toContain("'/': {");
      expect(output).toContain("'/about'");
      expect(output).toContain("'/dashboard'");
      expect(output).toContain('/posts/hello');
      expect(output).toContain('sourceFile: "/src/app/pages/index.page.ts"');
      expect(output).toContain('sourceFile: "/src/app/pages/about.page.ts"');
      expect(output).toContain(
        'sourceFile: "/libs/feature/src/pages/dashboard.page.ts"',
      );
      expect(output).toContain('sourceFile: "/libs/content/posts/hello.md"');
    });
  });

  describe('staleness detection', () => {
    it('throws when generated output differs from existing file', () => {
      const root = createFixture();
      writeFixtureFile(
        root,
        'src/app/pages/index.page.ts',
        `export default class HomePage {}
`,
      );

      generateRoutesFile(root);
      writeFixtureFile(
        root,
        'src/app/pages/about.page.ts',
        `export default class AboutPage {}
`,
      );

      expect(() => generateRoutesFile(root, { verify: true })).toThrow(
        /Stale route file detected/,
      );
    });

    it('does not throw when generated output matches existing file', () => {
      const root = createFixture();
      writeFixtureFile(
        root,
        'src/app/pages/index.page.ts',
        `export default class HomePage {}
`,
      );

      generateRoutesFile(root);
      expect(() => generateRoutesFile(root, { verify: true })).not.toThrow();
    });

    it('allows the first build to create the generated file', () => {
      const root = createFixture();
      writeFixtureFile(
        root,
        'src/app/pages/index.page.ts',
        `export default class HomePage {}
`,
      );

      expect(() => generateRoutesFile(root)).not.toThrow();
      expect(existsSync(join(root, 'src/routeTree.gen.ts'))).toBe(true);
    });

    it('fails a build after regenerating a stale checked-in file by default', () => {
      const root = createFixture();
      writeFixtureFile(
        root,
        'src/app/pages/index.page.ts',
        `export default class HomePage {}
`,
      );

      generateRoutesFile(root);
      writeFixtureFile(
        root,
        'src/app/pages/about.page.ts',
        `export default class AboutPage {}
`,
      );

      expect(() => generateRoutesFile(root)).toThrow(
        /Stale route file detected during build/,
      );
      expect(
        readFileSync(join(root, 'src/routeTree.gen.ts'), 'utf-8'),
      ).toContain("'/about'");
    });

    it('does not fail a fresh build when verifyOnBuild is enabled', () => {
      const root = createFixture();
      writeFixtureFile(
        root,
        'src/app/pages/index.page.ts',
        `export default class HomePage {}
`,
      );

      generateRoutesFile(root, { verifyOnBuild: false });
      expect(() => generateRoutesFile(root)).not.toThrow();
    });

    it('keeps dev watch regeneration self-healing', () => {
      const root = createFixture();
      writeFixtureFile(
        root,
        'src/app/pages/index.page.ts',
        `export default class HomePage {}
`,
      );

      const plugin = createPlugin(root, {}, 'serve');
      runBuildStart(plugin);

      const { server, emit } = createWatcherServer();
      const configureServerHook = plugin.configureServer;
      if (typeof configureServerHook === 'function') {
        configureServerHook.call({} as never, server);
      } else {
        configureServerHook?.handler.call({} as never, server);
      }

      const routePath = join(root, 'src/app/pages/about.page.ts');
      writeFixtureFile(
        root,
        'src/app/pages/about.page.ts',
        `export default class AboutPage {}
`,
      );

      expect(() => emit('add', routePath)).not.toThrow();
      expect(
        readFileSync(join(root, 'src/routeTree.gen.ts'), 'utf-8'),
      ).toContain("'/about'");
    });
  });

  it('fails build when same-priority files collide on the same route path', () => {
    const root = createFixture();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // Both files are app-local (same priority) and resolve to /test
    writeFixtureFile(
      root,
      'src/app/pages/test.page.ts',
      `export default class TestPage {}\n`,
    );
    writeFixtureFile(
      root,
      'src/content/test.md',
      `---\ntitle: Test\n---\nContent\n`,
    );

    expect(() =>
      generateRoutesFile(root, {
        additionalContentDirs: [],
      }),
    ).toThrow('Route collisions detected during build');
  });

  it('prefers app-local routes over additional pages dirs and warns on collisions', () => {
    const root = createFixture();
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    writeFixtureFile(
      root,
      'src/app/pages/blog/[slug].page.ts',
      `export default class AppBlogPage {}
`,
    );
    writeFixtureFile(
      root,
      'libs/shared/feature/src/pages/blog/[slug].page.ts',
      `export default class SharedBlogPage {}
`,
    );

    const output = generateRoutesFile(root, {
      additionalPagesDirs: ['/libs/shared/feature/src/pages'],
    });

    expect(output).toContain(
      'sourceFile: "/src/app/pages/blog/[slug].page.ts"',
    );
    expect(output).not.toContain(
      'sourceFile: "/libs/shared/feature/src/pages/blog/[slug].page.ts"',
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Keeping '/src/app/pages/blog/[slug].page.ts' based on route source precedence",
      ),
    );
  });

  it('keeps JSON-LD entries aligned with manifest collision winners', () => {
    const root = createFixture();
    writeFixtureFile(
      root,
      'src/app/pages/blog/[slug].page.ts',
      `export const routeMeta = {
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'Article',
    identifier: 'app-blog-page',
  },
};

export default class AppBlogPage {}
`,
    );
    writeFixtureFile(
      root,
      'libs/shared/feature/src/pages/blog/[slug].page.ts',
      `export const routeMeta = {
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'Article',
    identifier: 'shared-blog-page',
  },
};

export default class SharedBlogPage {}
`,
    );

    const output = generateRoutesFile(root, {
      additionalPagesDirs: ['/libs/shared/feature/src/pages'],
    });

    expect(output).toContain(
      "['/blog/[slug]', { routePath: '/blog/[slug]', sourceFile: '/src/app/pages/blog/[slug].page.ts'",
    );
    expect(output).not.toContain('shared-blog-page');
    expect(output).not.toContain(
      "sourceFile: '/libs/shared/feature/src/pages/blog/[slug].page.ts'",
    );
  });
});
