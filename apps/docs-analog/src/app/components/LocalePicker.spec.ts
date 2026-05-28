import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { CONTENT_LOCALE } from '@analogjs/content';
import { computeLocaleTarget, LocalePicker } from './LocalePicker';

describe('computeLocaleTarget', () => {
  it('adds a locale prefix to an unprefixed path', () => {
    expect(computeLocaleTarget('de', '/docs/introduction')).toBe(
      '/de/docs/introduction',
    );
  });

  it('swaps an existing locale prefix for a different one', () => {
    expect(computeLocaleTarget('pt-br', '/es/docs/introduction')).toBe(
      '/pt-br/docs/introduction',
    );
  });

  it('drops the prefix when picking the default English locale', () => {
    expect(computeLocaleTarget('en', '/de/docs/introduction')).toBe(
      '/docs/introduction',
    );
  });

  it('leaves an unprefixed path alone when picking English', () => {
    expect(computeLocaleTarget('en', '/docs/introduction')).toBe(
      '/docs/introduction',
    );
  });
});

describe('LocalePicker', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: CONTENT_LOCALE, useValue: null },
      ],
    });
  });

  it('shows the active locale label, defaulting to English', () => {
    const fixture = TestBed.createComponent(LocalePicker);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('English');
  });

  it('renders one menuitem per locale once opened', () => {
    const fixture = TestBed.createComponent(LocalePicker);
    fixture.detectChanges();
    const trigger = fixture.nativeElement.querySelector(
      'button',
    ) as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll(
      'button[role="menuitem"]',
    );
    expect(items.length).toBeGreaterThanOrEqual(5);
  });
});
