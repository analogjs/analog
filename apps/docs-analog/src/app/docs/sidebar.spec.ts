import { describe, expect, it } from 'vitest';
import { findSidebarIndex, flattenSidebar, type SidebarNode } from './sidebar';

const nodes: SidebarNode[] = [
  { kind: 'doc', id: 'introduction', label: 'Introduction' },
  { kind: 'break' },
  {
    kind: 'category',
    label: 'Guides',
    items: [
      { kind: 'doc', id: 'guides/forms', label: 'Forms' },
      {
        kind: 'category',
        label: 'Advanced',
        items: [{ kind: 'doc', id: 'guides/routing', label: 'Routing' }],
      },
    ],
  },
];

describe('flattenSidebar', () => {
  it('produces ordered typed links with nested slug segments', () => {
    const flat = flattenSidebar(nodes, null);
    expect(flat.map((e) => e.linkTo)).toEqual([
      { path: '/docs/[[...slug]]', params: { slug: ['introduction'] } },
      { path: '/docs/[[...slug]]', params: { slug: ['guides', 'forms'] } },
      { path: '/docs/[[...slug]]', params: { slug: ['guides', 'routing'] } },
    ]);
  });

  it('includes the active locale in typed route params', () => {
    const flat = flattenSidebar(nodes, 'es');
    expect(flat[0].linkTo).toEqual({
      path: '/[locale]/docs/[[...slug]]',
      params: { locale: 'es', slug: ['introduction'] },
    });
    expect(flat[2].linkTo).toEqual({
      path: '/[locale]/docs/[[...slug]]',
      params: { locale: 'es', slug: ['guides', 'routing'] },
    });
  });

  it('records the ancestor category labels of each entry', () => {
    const flat = flattenSidebar(nodes, null);
    expect(flat.map((e) => e.parents)).toEqual([
      [],
      ['Guides'],
      ['Guides', 'Advanced'],
    ]);
  });

  it('skips break nodes', () => {
    const flat = flattenSidebar(nodes, null);
    expect(flat).toHaveLength(3);
    expect(flat.map((e) => e.id)).toEqual([
      'introduction',
      'guides/forms',
      'guides/routing',
    ]);
  });
});

describe('findSidebarIndex', () => {
  it('returns -1 when slug is not in the tree', () => {
    expect(findSidebarIndex(flattenSidebar(nodes, null), 'missing')).toBe(-1);
  });

  it('locates a deeply nested slug in declaration order', () => {
    expect(
      findSidebarIndex(flattenSidebar(nodes, null), 'guides/routing'),
    ).toBe(2);
  });
});
