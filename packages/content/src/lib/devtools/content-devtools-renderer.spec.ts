import { Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ContentRenderer, RenderedContent } from '../content-renderer';
import { DevToolsContentRenderer } from './content-devtools-renderer';
import { DEVTOOLS_INNER_RENDERER } from './content-devtools-renderer';
import { withContentDevTools } from './index';

@Injectable()
class MockRenderer extends ContentRenderer {
  override async render(content: string): Promise<RenderedContent> {
    return {
      content: `<p>${content}</p>`,
      toc: [{ id: 'heading', level: 1, text: 'Heading' }],
    };
  }

  override getContentHeadings() {
    return [{ id: 'heading', level: 1, text: 'Heading' }];
  }
}

function setup() {
  TestBed.configureTestingModule({
    providers: [
      { provide: DEVTOOLS_INNER_RENDERER, useClass: MockRenderer },
      { provide: ContentRenderer, useClass: DevToolsContentRenderer },
    ],
  });
  return TestBed.inject(ContentRenderer) as DevToolsContentRenderer;
}

describe('DevToolsContentRenderer', () => {
  let dispatchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dispatchSpy = vi.spyOn(window, 'dispatchEvent');
  });

  it('delegates render to the inner renderer', async () => {
    const renderer = setup();
    const result = await renderer.render('# Test');

    expect(result.content).toContain('<p>');
    expect(result.toc).toHaveLength(1);
  });

  it('dispatches devtools event with timing data', async () => {
    const renderer = setup();
    await renderer.render('# Test');

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'analog-content-devtools-data',
      }),
    );

    const event = dispatchSpy.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toMatchObject({
      renderer: 'MockRenderer',
      contentLength: 6,
      headingCount: 1,
    });
    expect(event.detail.renderTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('includes toc in event detail', async () => {
    const renderer = setup();
    await renderer.render('# Heading');

    const event = dispatchSpy.mock.calls[0][0] as CustomEvent;
    expect(event.detail.toc).toEqual([
      { id: 'heading', level: 1, text: 'Heading' },
    ]);
  });

  it('delegates getContentHeadings to inner renderer', () => {
    const renderer = setup();
    const headings = renderer.getContentHeadings('# Test');

    expect(headings).toEqual([{ id: 'heading', level: 1, text: 'Heading' }]);
  });

  it('delegates enhance to inner renderer', () => {
    const renderer = setup();
    expect(() => renderer.enhance()).not.toThrow();
  });
});

describe('withContentDevTools', () => {
  it('wires providers so ContentRenderer delegates to the supplied renderer', async () => {
    TestBed.configureTestingModule({
      providers: [withContentDevTools(MockRenderer)],
    });

    const renderer = TestBed.inject(ContentRenderer);
    expect(renderer).toBeInstanceOf(DevToolsContentRenderer);

    const result = await renderer.render('hello');
    expect(result.content).toContain('<p>hello</p>');
  });

  it('provides the inner renderer under DEVTOOLS_INNER_RENDERER', () => {
    TestBed.configureTestingModule({
      providers: [withContentDevTools(MockRenderer)],
    });

    const inner = TestBed.inject(DEVTOOLS_INNER_RENDERER);
    expect(inner).toBeInstanceOf(MockRenderer);
  });
});
