import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { CONTENT_LOCALE } from '@analogjs/content';
import { provideI18n } from '@analogjs/router/i18n';
import { LocalePicker } from './LocalePicker';

describe('LocalePicker', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: CONTENT_LOCALE, useValue: null },
        provideI18n({
          defaultLocale: 'en',
          locales: ['en', 'de', 'es', 'pt-br', 'zh-hans'],
          loader: () => ({}),
        }),
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
