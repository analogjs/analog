import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { Footer } from './Footer';

describe('Footer', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('renders the three link columns with their headings', () => {
    const fixture = TestBed.createComponent(Footer);
    fixture.detectChanges();
    const titles = Array.from(
      fixture.nativeElement.querySelectorAll(
        'h3',
      ) as NodeListOf<HTMLHeadingElement>,
    ).map((h: HTMLHeadingElement) => h.textContent?.trim());
    expect(titles).toEqual(['Documentation', 'Open source', 'More']);
  });

  it('uses routerLink for internal items and href+target=_blank for external', () => {
    const fixture = TestBed.createComponent(Footer);
    fixture.detectChanges();
    const internal = fixture.nativeElement.querySelector(
      'a[href="/docs/introduction"]',
    ) as HTMLAnchorElement;
    expect(internal).toBeTruthy();
    expect(internal.target).not.toBe('_blank');

    const external = fixture.nativeElement.querySelector(
      'a[href="https://github.com/analogjs/analog"]',
    ) as HTMLAnchorElement;
    expect(external).toBeTruthy();
    expect(external.target).toBe('_blank');
    expect(external.rel).toContain('noopener');
  });
});
