import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ThemeToggle } from './theme-toggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
    localStorage.removeItem('docs-theme');
  });
  afterEach(() => {
    document.documentElement.classList.remove('dark');
    localStorage.removeItem('docs-theme');
  });

  it('clicking the button flips the dark class on <html> and persists', () => {
    const fixture = TestBed.createComponent(ThemeToggle);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      'button',
    ) as HTMLButtonElement;
    button.click();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('docs-theme')).toBe('dark');

    button.click();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('docs-theme')).toBe('light');
  });
});
