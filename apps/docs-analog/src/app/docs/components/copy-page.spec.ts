import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { CopyPage, markdownForCopy } from './copy-page';

describe('markdownForCopy', () => {
  it('prepends the page title as an H1', () => {
    expect(markdownForCopy('Body text', 'Intro')).toBe('# Intro\n\nBody text');
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
    fixture.componentRef.setInput('markdown', 'Body');
    fixture.componentRef.setInput('pageTitle', 'Intro');
    fixture.componentRef.setInput('slug', 'introduction');
    fixture.detectChanges();
    return fixture;
  }

  it('copies the prepared markdown to the clipboard', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() =>
      Promise.resolve(),
    );
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const fixture = setup();

    (
      fixture.nativeElement.querySelector('button') as HTMLButtonElement
    ).click();

    expect(writeText).toHaveBeenCalledWith('# Intro\n\nBody');
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
