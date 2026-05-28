import { Component } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { SidebarDrawer } from './SidebarDrawer';

@Component({ template: '' })
class BlankRoute {}

function mountDrawer(): {
  fixture: ReturnType<typeof TestBed.createComponent<SidebarDrawer>>;
  el: HTMLElement;
} {
  TestBed.configureTestingModule({
    providers: [provideRouter([{ path: '**', component: BlankRoute }])],
  });
  const fixture = TestBed.createComponent(SidebarDrawer);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement };
}

describe('SidebarDrawer', () => {
  it('toggles open via the hamburger and close via the X', () => {
    const { fixture, el } = mountDrawer();
    const open = el.querySelector(
      'button[aria-label="Open documentation menu"]',
    ) as HTMLButtonElement;
    const aside = el.querySelector('aside') as HTMLElement;

    expect(open.getAttribute('aria-expanded')).toBe('false');
    expect(aside.classList.contains('translate-x-0')).toBe(false);

    open.click();
    fixture.detectChanges();

    expect(open.getAttribute('aria-expanded')).toBe('true');
    expect(aside.classList.contains('translate-x-0')).toBe(true);

    const close = el.querySelector(
      'button[aria-label="Close documentation menu"]',
    ) as HTMLButtonElement;
    close.click();
    fixture.detectChanges();

    expect(open.getAttribute('aria-expanded')).toBe('false');
    expect(aside.classList.contains('translate-x-0')).toBe(false);
  });

  it('closes on Escape', () => {
    const { fixture, el } = mountDrawer();
    const open = el.querySelector(
      'button[aria-label="Open documentation menu"]',
    ) as HTMLButtonElement;
    open.click();
    fixture.detectChanges();
    expect(open.getAttribute('aria-expanded')).toBe('true');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(open.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on router navigation', async () => {
    const { fixture, el } = mountDrawer();
    const open = el.querySelector(
      'button[aria-label="Open documentation menu"]',
    ) as HTMLButtonElement;
    open.click();
    fixture.detectChanges();
    expect(open.getAttribute('aria-expanded')).toBe('true');

    await TestBed.inject(Router).navigateByUrl('/anywhere');
    fixture.detectChanges();

    expect(open.getAttribute('aria-expanded')).toBe('false');
  });
});
