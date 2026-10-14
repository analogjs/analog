import { HostTree, SchematicContext } from '@angular-devkit/schematics';
import { describe, expect, it } from 'vitest';

import updateNitroOptions from './update-nitro-options';

function migrate(config: string): { result: string; warnings: string[] } {
  const tree = new HostTree();
  tree.create('/vite.config.ts', config);
  const warnings: string[] = [];
  const context = {
    logger: { info: () => undefined, warn: (m: string) => warnings.push(m) },
  } as unknown as SchematicContext;
  updateNitroOptions()(tree, context);
  return { result: tree.readText('/vite.config.ts'), warnings };
}

const withImport = (call: string) =>
  `import nitro from '@analogjs/vite-plugin-nitro';\nexport default { plugins: [${call}] };\n`;

describe('updateNitroOptions', () => {
  it('moves the Nitro config into the single argument', () => {
    expect(
      migrate(withImport(`nitro({}, { routeRules: { '/a': { ssr: false } } })`))
        .result,
    ).toContain(`nitro({ routeRules: { '/a': { ssr: false } } })`);
  });

  it('moves the Analog options under analog', () => {
    expect(
      migrate(withImport(`nitro({ ssr: true }, { preset: 'node-server' })`))
        .result,
    ).toContain(`nitro({ preset: 'node-server', analog: { ssr: true } })`);
  });

  it('wraps a single argument using Analog options', () => {
    const { result } = migrate(
      withImport(`nitro({ ssr: true, entryServer: 'src/main.server.tsx' })`),
    );

    expect(result).toContain(
      `nitro({ analog: { ssr: true, entryServer: 'src/main.server.tsx' } })`,
    );
  });

  it('spreads a Nitro config that is not an object literal', () => {
    expect(
      migrate(withImport(`nitro({ ssr: true }, nitroConfig)`)).result,
    ).toContain(`nitro({ ...nitroConfig, analog: { ssr: true } })`);
  });

  it('leaves calls already using the Nitro config', () => {
    const config = withImport(`nitro({ routeRules: {} })`);

    expect(migrate(config).result).toBe(config);
  });

  it('warns about calls it cannot rewrite', () => {
    const config = withImport(`nitro(options)`);
    const { result, warnings } = migrate(config);

    expect(result).toBe(config);
    expect(warnings).toHaveLength(1);
  });

  it('ignores nitro() from nitro/vite', () => {
    const config = `import { nitro } from 'nitro/vite';\nexport default { plugins: [nitro({ ssr: true })] };\n`;

    expect(migrate(config).result).toBe(config);
  });
});
