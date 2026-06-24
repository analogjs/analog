import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ANALOG_DOCS_CONFIG, type DocsConfig } from '../config';
import { LocalePicker } from './locale-picker';

function setup(overrides: Partial<DocsConfig> = {}) {
  const switchLocale = vi.fn<(code: string) => void>();
  const config: DocsConfig = {
    brand: { name: 'Demo', logoSrc: '' },
    locales: {
      default: 'en',
      list: [
        { code: 'en', label: 'English' },
        { code: 'es', label: 'Español' },
      ],
    },
    switchLocaleFactory: () => switchLocale,
    ...overrides,
  };
  TestBed.configureTestingModule({
    providers: [{ provide: ANALOG_DOCS_CONFIG, useValue: config }],
  });
  const fixture = TestBed.createComponent(LocalePicker);
  fixture.detectChanges();
  return { fixture, switchLocale };
}

describe('LocalePicker', () => {
  it('renders nothing when no locales are configured', () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ANALOG_DOCS_CONFIG,
          useValue: { brand: { name: 'D', logoSrc: '' } } satisfies DocsConfig,
        },
      ],
    });
    const fixture = TestBed.createComponent(LocalePicker);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('clicking a menu item invokes the switchLocale callback', () => {
    const { fixture, switchLocale } = setup();
    const trigger = fixture.nativeElement.querySelector(
      'button',
    ) as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();

    const items = fixture.nativeElement.querySelectorAll<HTMLButtonElement>(
      'ul[role="menu"] button',
    );
    expect(items.length).toBe(2);
    items[1].click();
    expect(switchLocale).toHaveBeenCalledWith('es');
  });
});
