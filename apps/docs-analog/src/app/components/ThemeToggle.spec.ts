import { TestBed } from '@angular/core/testing';
import { ThemeToggle } from './ThemeToggle';

function mountThemeToggle(): {
  fixture: ReturnType<typeof TestBed.createComponent<ThemeToggle>>;
  el: HTMLElement;
} {
  const fixture = TestBed.createComponent(ThemeToggle);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement };
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
    localStorage.clear();
  });

  it('toggles the .dark class on <html> and persists the choice', () => {
    const { el } = mountThemeToggle();
    const button = el.querySelector('button') as HTMLButtonElement;

    button.click();

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('docs-theme')).toBe('dark');

    button.click();

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('docs-theme')).toBe('light');
  });

  it('follows live system preference changes when no override is set', () => {
    const listeners: ((e: MediaQueryListEvent) => void)[] = [];
    const mql = {
      matches: false,
      addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) =>
        listeners.push(cb),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;
    vi.spyOn(window, 'matchMedia').mockReturnValue(mql);

    mountThemeToggle();
    expect(listeners).toHaveLength(1);

    // System flips to dark, no localStorage override → component reacts.
    listeners[0]({ matches: true } as MediaQueryListEvent);
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    // User toggles, persisting an override.
    localStorage.setItem('docs-theme', 'light');
    document.documentElement.classList.remove('dark');

    // System flips again — override means component leaves DOM alone.
    listeners[0]({ matches: true } as MediaQueryListEvent);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
