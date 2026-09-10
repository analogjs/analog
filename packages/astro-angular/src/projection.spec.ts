import '@angular/compiler';
import { Component, DOCUMENT, reflectComponentType } from '@angular/core';
import { platformServer } from '@angular/platform-server';
import { buildProjectableNodes } from './projection';

const CardComponent = Component({
  selector: 'app-card',
  template: `
    <ng-content select="[question]" />
    <ng-content select=".footer, footer" />
    <ng-content />
  `,
})(class CardComponent {});

const HeaderOnlyComponent = Component({
  selector: 'app-header-only',
  template: `<ng-content select="[question]" />`,
})(class HeaderOnlyComponent {});

const PlainComponent = Component({
  selector: 'app-plain',
  template: `<p>No projection</p>`,
})(class PlainComponent {});

const mirror = reflectComponentType(CardComponent)!;
const platformRef = platformServer();
const document = platformRef.injector.get(DOCUMENT);

afterAll(() => platformRef.destroy());

function names(nodes: Node[]): string[] {
  return nodes.map((node) =>
    node.nodeType === 3 ? `#text(${node.textContent})` : node.nodeName,
  );
}

describe('buildProjectableNodes', () => {
  it('should return undefined for components without ng-content', () => {
    const plainMirror = reflectComponentType(PlainComponent)!;

    expect(
      buildProjectableNodes(plainMirror, { default: '<p>Hi</p>' }, document),
    ).toBeUndefined();
  });

  it('should index the result by ngContentSelectors', () => {
    expect(mirror.ngContentSelectors).toEqual([
      '[question]',
      '.footer, footer',
      '*',
    ]);
    expect(buildProjectableNodes(mirror, {}, document)).toEqual([[], [], []]);
    expect(buildProjectableNodes(mirror, undefined, document)).toEqual([
      [],
      [],
      [],
    ]);
  });

  it('should distribute nodes using the ng-content selectors', () => {
    const nodes = buildProjectableNodes(
      mirror,
      {
        default:
          '<p question>Is content projection cool?</p>\n' +
          "<p>Let's learn about content projection!</p>\n" +
          '<footer>The end</footer>',
      },
      document,
    )!;

    expect(names(nodes[0])).toEqual(['P']);
    expect(names(nodes[1])).toEqual(['FOOTER']);
    expect(names(nodes[2])).toEqual(['P']);
    expect((nodes[0][0] as Element).hasAttribute('question')).toBe(true);
    expect(nodes[2][0].textContent).toBe(
      "Let's learn about content projection!",
    );
  });

  it('should project text-only children into the default slot', () => {
    const nodes = buildProjectableNodes(
      mirror,
      { default: 'Hello World' },
      document,
    )!;

    expect(names(nodes[2])).toEqual(['#text(Hello World)']);
  });

  it('should merge Astro named slots into the same content', () => {
    const nodes = buildProjectableNodes(
      mirror,
      { question: '<p question>Q</p>', default: '<span>Body</span>' },
      document,
    )!;

    expect(names(nodes[0])).toEqual(['P']);
    expect(names(nodes[2])).toEqual(['SPAN']);
  });

  it('should drop unmatched nodes when there is no default slot', () => {
    const headerMirror = reflectComponentType(HeaderOnlyComponent)!;

    const nodes = buildProjectableNodes(
      headerMirror,
      { default: '<p question>Q</p><p>Dropped</p>Dropped too' },
      document,
    )!;

    expect(nodes).toHaveLength(1);
    expect(names(nodes[0])).toEqual(['P']);
  });

  it('should honor ngProjectAs instead of the element selector', () => {
    const nodes = buildProjectableNodes(
      mirror,
      {
        default:
          '<div ngProjectAs="[question]">Q</div>' +
          '<div ngProjectAs="footer">F1</div>' +
          '<div ngProjectAs=".footer">F2</div>' +
          '<p question ngProjectAs="span">Body</p>',
      },
      document,
    )!;

    expect(nodes[0].map((n) => n.textContent)).toEqual(['Q']);
    expect(nodes[1].map((n) => n.textContent)).toEqual(['F1', 'F2']);
    expect(nodes[2].map((n) => n.textContent)).toEqual(['Body']);
  });

  it('should preserve elements that need a parsing context', () => {
    const nodes = buildProjectableNodes(
      mirror,
      { default: '<tr><td>Table row</td></tr>' },
      document,
    )!;

    expect(names(nodes[2])).toEqual(['TR']);
  });
});
