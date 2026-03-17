import {
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

  afterEach(() => {
    vi.restoreAllMocks();

    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop() as string, { recursive: true, force: true });
    }
  });

  function createFixture(): string {
    const root = mkdtempSync(join(tmpdir(), 'analog-typed-routes-'));
    tempDirs.push(root);
    mkdirSync(join(root, 'src/app/pages'), { recursive: true });
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

  function generateRoutesFile(
    root: string,
    options: Parameters<typeof typedRoutes>[0] = {},
  ): string {
    const plugin = typedRoutes({
      workspaceRoot: root,
      ...options,
    });

    plugin.config?.call({} as never, { root: '.' });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    plugin.buildStart?.call({} as never);

    return readFileSync(
      join(root, options.outFile ?? 'src/routeTree.gen.ts'),
      'utf-8',
    );
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

    // Should import schema-dts types
    expect(output).toContain(
      "import type { Graph, Thing, WithContext } from 'schema-dts';",
    );
    // Should declare AnalogJsonLdDocument type alias
    expect(output).toContain(
      'export type AnalogJsonLdDocument = WithContext<Thing> | Graph | Array<WithContext<Thing>>;',
    );
    // Should use AnalogJsonLdDocument in manifest entry type
    expect(output).toContain('AnalogJsonLdDocument[]');
    // Should still have the manifest
    expect(output).toContain('export const routeJsonLdManifest = new Map');
  });
});
