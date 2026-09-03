import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { CopyPage, markdownForCopy } from './copy-page';

describe('markdownForCopy', () => {
  it('strips frontmatter and prepends the page title as an H1', () => {
    expect(
      markdownForCopy('---\ntitle: Intro\n---\n\nBody text', 'Intro'),
    ).toBe('# Intro\n\nBody text');
  });

  it('keeps an existing leading H1 instead of doubling it', () => {
    expect(markdownForCopy('# Contributing\n\nBody', 'Contributing')).toBe(
      '# Contributing\n\nBody',
    );
  });
});

describe('CopyPage', () => {
  function setup() {
    const fixture = TestBed.createComponent(CopyPage);
    fixture.componentRef.setInput('pageTitle', 'Intro');
    fixture.componentRef.setInput('slug', 'introduction');
    fixture.detectChanges();
    return fixture;
  }

  it('fetches the .md asset and copies the prepared markdown', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() =>
      Promise.resolve(),
    );
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response('---\ntitle: Intro\n---\n\nBody', { status: 200 }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const fixture = setup();

    (
      fixture.nativeElement.querySelector('button') as HTMLButtonElement
    ).click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledWith('/docs/introduction.md');
    expect(writeText).toHaveBeenCalledWith('# Intro\n\nBody');
    vi.unstubAllGlobals();
  });

  it('does not copy when the .md asset is unavailable', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() =>
      Promise.resolve(),
    );
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    vi.stubGlobal('fetch', () =>
      Promise.resolve(new Response('<html></html>', { status: 200 })),
    );
    const fixture = setup();

    (
      fixture.nativeElement.querySelector('button') as HTMLButtonElement
    ).click();
    await new Promise((r) => setTimeout(r));

    expect(writeText).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('links to the .md URL of the current page', () => {
    const fixture = setup();
    const buttons = (
      fixture.nativeElement as HTMLElement
    ).querySelectorAll<HTMLButtonElement>('button');
    buttons[1].click();
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector(
      'ul[role="menu"] a',
    ) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/docs/introduction.md');
  });
});
