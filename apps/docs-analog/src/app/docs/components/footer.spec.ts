import { provideRouter, Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ANALOG_DOCS_CONFIG, type DocsConfig } from '../config';
import { Footer } from './footer';

function setup(config: DocsConfig) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      { provide: ANALOG_DOCS_CONFIG, useValue: config },
    ],
  });
  const fixture = TestBed.createComponent(Footer);
  fixture.detectChanges();
  return fixture;
}

const localizedConfig: DocsConfig = {
  brand: { name: 'Demo', logoSrc: '' },
  locales: {
    default: 'en',
    list: [
      { code: 'en', label: 'English' },
      { code: 'de', label: 'Deutsch' },
    ],
  },
  footer: {
    columns: [
      { title: 'Docs', items: [{ label: 'Intro', routerLink: '/docs/intro' }] },
    ],
  },
};

describe('Footer', () => {
  it('renders the column titles and items from config', () => {
    const fixture = setup({
      brand: { name: 'Demo', logoSrc: '' },
      footer: {
        columns: [
          {
            title: 'Docs',
            items: [{ label: 'Intro', routerLink: '/docs/intro' }],
          },
          {
            title: 'More',
            items: [{ label: 'GitHub', href: 'https://github.com' }],
          },
        ],
        legalLine: '© 2099 Demo.',
      },
    });
    const text = fixture.nativeElement.textContent ?? '';
    expect(text).toContain('Docs');
    expect(text).toContain('Intro');
    expect(text).toContain('GitHub');
    expect(text).toContain('© 2099 Demo.');
  });

  it('omits the columns container when no columns are configured', () => {
    const fixture = setup({ brand: { name: 'Demo', logoSrc: '' } });
    expect(fixture.nativeElement.querySelector('.mx-auto.grid')).toBeNull();
  });

  it('keeps internal links unprefixed on the default locale', () => {
    const fixture = setup(localizedConfig);
    const href = fixture.nativeElement
      .querySelector('a[href]')
      .getAttribute('href');
    expect(href).toBe('/docs/intro');
  });

  it('prefixes internal links with the active non-default locale', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        { provide: ANALOG_DOCS_CONFIG, useValue: localizedConfig },
      ],
    });
    await TestBed.inject(Router).navigateByUrl('/de/docs/intro');
    const fixture = TestBed.createComponent(Footer);
    fixture.detectChanges();
    const href = fixture.nativeElement
      .querySelector('a[href]')
      .getAttribute('href');
    expect(href).toBe('/de/docs/intro');
  });
});
