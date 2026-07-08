import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ANALOG_DOCS_CONFIG, type DocsConfig } from '../config';
import { Footer } from './footer';

function setup(config: DocsConfig) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ANALOG_DOCS_CONFIG, useValue: config },
    ],
  });
  const fixture = TestBed.createComponent(Footer);
  fixture.detectChanges();
  return fixture;
}

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
});
