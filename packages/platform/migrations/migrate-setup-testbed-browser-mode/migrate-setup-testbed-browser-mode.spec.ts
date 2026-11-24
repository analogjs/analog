import { describe, expect, it } from 'vitest';

import { migrateSetupTestBedSource } from './migrate-setup-testbed-browser-mode';

const IMPORT = `import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';\n`;

function migrate(call: string): string | null {
  return migrateSetupTestBedSource('/src/test-setup.ts', `${IMPORT}${call}`);
}

describe('migrate-setup-testbed-browser-mode', () => {
  it('replaces browserMode: true with teardown.destroyAfterEach: false', () => {
    expect(migrate('setupTestBed({ browserMode: true });')).toBe(
      `${IMPORT}setupTestBed({ teardown: { destroyAfterEach: false } });`,
    );
  });

  it('removes browserMode: false', () => {
    expect(
      migrate('setupTestBed({ zoneless: false, browserMode: false });'),
    ).toBe(`${IMPORT}setupTestBed({ zoneless: false });`);
    expect(migrate('setupTestBed({ browserMode: false });')).toBe(
      `${IMPORT}setupTestBed();`,
    );
  });

  it('negates non-literal browserMode values', () => {
    expect(migrate('setupTestBed({ browserMode: isBrowser });')).toBe(
      `${IMPORT}setupTestBed({ teardown: { destroyAfterEach: !(isBrowser) } });`,
    );
  });

  it('migrates shorthand browserMode', () => {
    expect(migrate('setupTestBed({ browserMode });')).toBe(
      `${IMPORT}setupTestBed({ teardown: { destroyAfterEach: !(browserMode) } });`,
    );
  });

  it('keeps an explicit teardown option', () => {
    expect(
      migrate(
        'setupTestBed({ browserMode: true, teardown: { destroyAfterEach: true } });',
      ),
    ).toBe(`${IMPORT}setupTestBed({ teardown: { destroyAfterEach: true } });`);
  });
});
