import { describe, expect, it } from 'vitest';
import { componentHmrId, resolveHmrSource } from './component-hmr-id.js';

describe('native Angular HMR file identities', () => {
  it('canonicalizes Windows directories without changing class names', () => {
    expect(componentHmrId('Project\\src\\App.ts', 'AppComponent', false)).toBe(
      'project/src/app.ts@AppComponent',
    );
  });

  it('preserves case on a case-sensitive compiler host', () => {
    expect(componentHmrId('Project/src/App.ts', 'AppComponent', true)).toBe(
      'Project/src/App.ts@AppComponent',
    );
  });

  it('resolves canonical requests to the actual module graph key', () => {
    const files = new Map([['D:/Project/src/App.ts', 'AppComponent']]);
    expect(resolveHmrSource(files, 'd:/project/src/app.ts', false)).toBe(
      'D:/Project/src/App.ts',
    );
    expect(resolveHmrSource(files, 'D:/Project/src/App.ts', false)).toBe(
      'D:/Project/src/App.ts',
    );
    expect(resolveHmrSource(files, '/other.ts', false)).toBe('/other.ts');
  });

  it('does not alias distinct source files on case-sensitive hosts', () => {
    const files = new Map([['/Project/App.ts', 'App']]);
    expect(resolveHmrSource(files, '/project/app.ts', true)).toBe(
      '/project/app.ts',
    );
  });
});
