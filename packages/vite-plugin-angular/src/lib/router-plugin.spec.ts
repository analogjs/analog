import { beforeEach, describe, expect, it, vi } from 'vitest';

const { transformFile } = vi.hoisted(() => ({ transformFile: vi.fn() }));
vi.mock('./utils/devkit.js', () => ({
  JavaScriptTransformer: class {
    transformFile = transformFile;
    close = vi.fn();
  },
}));

import { routerPlugin } from './router-plugin.js';

function transform(code: string, id: string) {
  const hook = routerPlugin().transform as {
    handler: (
      code: string,
      id: string,
    ) => Promise<{ code: string } | undefined>;
  };
  return hook.handler(code, id);
}

beforeEach(() => {
  transformFile.mockReset();
  transformFile.mockResolvedValue(Buffer.from('export const linked = true;'));
});

describe('dependency optimization without native Vite hook filters', () => {
  it.each(['/src/app.component.ts', '/src/main.js', '/@vite/client'])(
    'leaves %s to its source compiler',
    async (id) => {
      await expect(
        transform('already compiled Angular output', id),
      ).resolves.toBeUndefined();
      expect(transformFile).not.toHaveBeenCalled();
    },
  );

  it('links an Angular FESM dependency and strips its query before reading', async () => {
    await expect(
      transform(
        'partial declarations',
        '/node_modules/@angular/core/fesm2022/core.mjs?v=123',
      ),
    ).resolves.toEqual({ code: 'export const linked = true;' });
    expect(transformFile).toHaveBeenCalledWith(
      '/node_modules/@angular/core/fesm2022/core.mjs',
    );
  });
});
