import { describe, expect, it } from 'vitest';
import { findSidebarIndex, flattenSidebar, type SidebarNode } from './sidebar';

const nodes: SidebarNode[] = [
  { kind: 'doc', id: 'introduction', label: 'Introduction' },
  {
    kind: 'category',
    label: 'Guides',
    items: [
      { kind: 'doc', id: 'guides/forms', label: 'Forms' },
      { kind: 'doc', id: 'guides/routing', label: 'Routing' },
    ],
  },
];

describe('flattenSidebar', () => {
  it('produces an ordered list with default-locale hrefs when no locale is given', () => {
    const flat = flattenSidebar(nodes, null);
    expect(flat.map((e) => e.href)).toEqual([
      '/docs/introduction',
      '/docs/guides/forms',
      '/docs/guides/routing',
    ]);
  });

  it('prefixes hrefs with the active locale', () => {
    const flat = flattenSidebar(nodes, 'es');
    expect(flat[0].href).toBe('/es/docs/introduction');
    expect(flat[2].href).toBe('/es/docs/guides/routing');
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
