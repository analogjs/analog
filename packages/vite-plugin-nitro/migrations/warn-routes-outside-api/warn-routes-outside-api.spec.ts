import { HostTree, SchematicContext } from '@angular-devkit/schematics';
import { describe, expect, it } from 'vitest';

import warnRoutesOutsideApi from './warn-routes-outside-api';

function warningsFor(files: string[]): string[] {
  const tree = new HostTree();
  for (const file of files) {
    tree.create(file, '');
  }
  const warnings: string[] = [];
  const context = {
    logger: { info: () => undefined, warn: (m: string) => warnings.push(m) },
  } as unknown as SchematicContext;
  warnRoutesOutsideApi()(tree, context);
  return warnings;
}

describe('warnRoutesOutsideApi', () => {
  it('lists handlers outside routes/api, including nested ones', () => {
    const warnings = warningsFor([
      '/apps/app/src/server/routes/github-info.ts',
      '/apps/app/src/server/routes/trpc/[trpc].ts',
      '/apps/app/src/server/routes/api/notes.ts',
    ]);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('/apps/app/src/server/routes/github-info.ts');
    expect(warnings[0]).toContain('/apps/app/src/server/routes/trpc/[trpc].ts');
    expect(warnings[0]).not.toContain('notes.ts');
    expect(warnings[0]).toContain('/apps/app/src/server/routes/api');
  });

  it('stays quiet when every handler is under routes/api', () => {
    expect(
      warningsFor([
        '/src/server/routes/api/v1/hello.ts',
        '/src/server/middleware/auth.ts',
      ]),
    ).toEqual([]);
  });

  it('ignores routes folders inside node_modules', () => {
    expect(
      warningsFor(['/node_modules/some-app/src/server/routes/hello.ts']),
    ).toEqual([]);
  });

  it('warns once per project', () => {
    expect(
      warningsFor([
        '/apps/one/src/server/routes/a.ts',
        '/apps/two/src/server/routes/b.ts',
      ]),
    ).toHaveLength(2);
  });
});
