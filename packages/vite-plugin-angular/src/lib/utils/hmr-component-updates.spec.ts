import { describe, expect, it } from 'vitest';
import { findHmrComponentUpdates } from './hmr-component-updates.js';

const components = new Set(['AppComponent', 'OtherComponent']);

function source({
  meta = `selector: 'app-root', template: '<h1>Before</h1>'`,
  members = `title = 'app';`,
  extra = '',
} = {}) {
  return `import { Component } from '@angular/core';
const limit = 1;
${extra}
@Component({ ${meta} })
export class AppComponent { ${members} }
`;
}

function updates(stale: string, updated: string) {
  return findHmrComponentUpdates('app.ts', stale, updated, components);
}

describe('findHmrComponentUpdates', () => {
  it.each([
    ['inline template', `selector: 'app-root', template: '<h1>After</h1>'`],
    [
      'added inline styles',
      `selector: 'app-root', template: '<h1>Before</h1>', styles: ['h1 {}']`,
    ],
    ['removed template field', `selector: 'app-root', templateUrl: './a.html'`],
    [
      'reordered template field',
      `template: '<h1>After</h1>', selector: 'app-root'`,
    ],
  ])('updates a component after a %s change', (_, meta) => {
    expect(updates(source(), source({ meta }))).toEqual(['AppComponent']);
  });

  it.each([
    ['selector', { meta: `selector: 'app-next', template: '<h1>Before</h1>'` }],
    ['class member', { members: `title = 'next';` }],
    ['top-level statement', { extra: 'export const next = 2;' }],
    [
      'shorthand metadata',
      { meta: `selector: 'app-root', template: '<h1>After</h1>', limit` },
    ],
  ])('reloads after a %s change', (_, change) => {
    expect(updates(source(), source(change))).toBeNull();
  });

  it('reloads when only non-component code changes', () => {
    expect(
      updates(source(), source().replace('limit = 1', 'limit = 2')),
    ).toBeNull();
  });

  it('reloads when nothing changed', () => {
    expect(updates(source(), source())).toBeNull();
  });

  it('reloads when a decorator before export changes', () => {
    const directive = (selector: string) =>
      `${source()}@Directive({ selector: '${selector}' }) export class Dir {}\n`;
    const stale = directive('a');
    expect(
      updates(stale, directive('b').replace('Before</h1>', 'After</h1>')),
    ).toBeNull();
  });

  it('reloads components with more than one decorator', () => {
    const decorated = (template: string) =>
      source()
        .replace('@Component', '@Other()\n@Component')
        .replace('<h1>Before</h1>', template);
    expect(
      updates(decorated('<h1>Before</h1>'), decorated('<h1>After</h1>')),
    ).toBeNull();
  });

  it('reloads on syntax errors', () => {
    expect(updates(source(), `${source()} class {`)).toBeNull();
  });
});
