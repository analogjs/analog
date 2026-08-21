import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { describe, expect, it } from 'vitest';
import AboutPage from './about.page';
import ContactPage from './contact.page';
import DevelopersPage from './developers.page';
import PrivacyPage from './privacy.page';

const PAGES = [
  { component: AboutPage, path: '/about', title: 'About | Analog' },
  { component: ContactPage, path: '/contact', title: 'Contact | Analog' },
  {
    component: DevelopersPage,
    path: '/developers',
    title: 'Developers | Analog',
  },
  { component: PrivacyPage, path: '/privacy', title: 'Privacy | Analog' },
];

function setup(component: (typeof PAGES)[number]['component']) {
  TestBed.configureTestingModule({
    providers: [provideRouter([{ path: '**', children: [] }])],
  });
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  return fixture;
}

describe.each(PAGES)('$path page', ({ component, path, title }) => {
  it('renders enough substantive content to act as a trust anchor', () => {
    const fixture = setup(component);
    const text = (fixture.nativeElement.textContent ?? '').trim();
    expect(text.length).toBeGreaterThanOrEqual(500);
  });

  it('sets the page title, description, and canonical URL', () => {
    setup(component);
    expect(TestBed.inject(Title).getTitle()).toBe(title);
    const canonical = document.head.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    expect(canonical?.href).toBe(`https://analogjs.org${path}`);
    const description = document.head.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    expect(description?.content?.length ?? 0).toBeGreaterThan(50);
  });
});

describe('developers page', () => {
  it('links the machine-readable resources', () => {
    const fixture = setup(DevelopersPage);
    const hrefs = Array.from(
      fixture.nativeElement.querySelectorAll('a[href]'),
    ).map((a) => (a as HTMLAnchorElement).getAttribute('href'));
    for (const expected of [
      '/openapi.json',
      '/api/v1/docs.json',
      '/llms.txt',
      '/llms-full.txt',
      '/sitemap.xml',
    ]) {
      expect(hrefs).toContain(expected);
    }
  });
});
