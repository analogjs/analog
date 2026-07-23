import { describe, expect, it } from 'vitest';
import { afterBodyOpen, bodyInner, headInner } from './stream-html';

describe('afterBodyOpen', () => {
  it('returns the offset just after the opening body tag', () => {
    const html = '<html><head></head><body class="x">hi</body></html>';
    expect(html.slice(afterBodyOpen(html))).toBe('hi</body></html>');
  });

  it('returns 0 when there is no body', () => {
    expect(afterBodyOpen('<div>no body</div>')).toBe(0);
  });
});

describe('bodyInner', () => {
  it('extracts the inner HTML of the body', () => {
    expect(bodyInner('<html><body><p>hi</p></body></html>')).toBe('<p>hi</p>');
  });

  it('handles body attributes', () => {
    expect(bodyInner('<body data-x="1"><span>a</span></body>')).toBe(
      '<span>a</span>',
    );
  });

  it('falls back to the end of the string when </body> is missing', () => {
    expect(bodyInner('<body>tail')).toBe('tail');
  });
});

describe('headInner', () => {
  it('extracts the inner HTML of the head', () => {
    const html =
      '<html><head><title>T</title><meta name="x"></head><body></body></html>';
    expect(headInner(html)).toBe('<title>T</title><meta name="x">');
  });

  it('returns an empty string when there is no head', () => {
    expect(headInner('<body></body>')).toBe('');
  });
});
