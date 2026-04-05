import {
  appendBreadcrumb,
  classifyVitePayload,
  readStoredBreadcrumbs,
  writeStoredBreadcrumbs,
  type HmrBreadcrumb,
} from './hmr-diagnostics';

describe('hmr-diagnostics helpers', () => {
  it('trims breadcrumb history to the requested limit', () => {
    const history = [
      { href: '/', now: 1, phase: 'one' },
      { href: '/', now: 2, phase: 'two' },
    ] satisfies HmrBreadcrumb[];

    const next = appendBreadcrumb(
      history,
      { href: '/', now: 3, phase: 'three' },
      2,
    );

    expect(next.map((entry) => entry.phase)).toEqual(['two', 'three']);
  });

  it('classifies vite full reload payloads', () => {
    expect(classifyVitePayload({ type: 'full-reload' })).toBe('full-reload');
  });

  it('classifies vite css updates', () => {
    expect(
      classifyVitePayload({
        type: 'update',
        updates: [{ type: 'css-update' }],
      }),
    ).toBe('css-update');
  });

  it('round-trips stored breadcrumbs', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem(key: string) {
        return store.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        store.set(key, value);
      },
    };

    const breadcrumbs: HmrBreadcrumb[] = [
      { href: '/', now: 1, phase: 'bootstrap' },
    ];

    writeStoredBreadcrumbs(storage, breadcrumbs);

    expect(readStoredBreadcrumbs(storage)).toEqual(breadcrumbs);
  });
});
