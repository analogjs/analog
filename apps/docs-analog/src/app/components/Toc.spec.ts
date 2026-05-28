import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { ElementRef } from '@angular/core';
import { extractHeadings, Heading, Toc } from './Toc';

describe('extractHeadings', () => {
  it('parses h2 and h3 with id and clean text', () => {
    const html = `
      <h2 id="defining-routes">Defining Routes</h2>
      <p>intro</p>
      <h3 id="static-routes">Static <code>Routes</code></h3>
      <h2>No id, no entry</h2>
    `;
    expect(extractHeadings(html)).toEqual<Heading[]>([
      { level: 2, text: 'Defining Routes', id: 'defining-routes' },
      { level: 3, text: 'Static Routes', id: 'static-routes' },
    ]);
  });

  it('returns an empty array for content with no headings', () => {
    expect(extractHeadings('<p>just prose</p>')).toEqual([]);
  });
});

describe('Toc', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('collects h2/h3 from the article DOM and renders them as anchor links', () => {
    const article = document.createElement('article');
    article.innerHTML = `
      <h2 id="one">One</h2>
      <h2 id="two">Two</h2>
    `;
    document.body.appendChild(article);

    const fixture = TestBed.createComponent(Toc);
    fixture.componentRef.setInput('articleRef', new ElementRef(article));
    fixture.detectChanges();

    const links = fixture.nativeElement.querySelectorAll('a');
    expect(links).toHaveLength(2);
    expect(links[0].textContent).toContain('One');
    expect(links[1].textContent).toContain('Two');
    // hrefs include the current route's pathname so <base href="/">
    // doesn't strip them down to /#id.
    expect(links[0].getAttribute('href')).toMatch(/#one$/);
    expect(links[1].getAttribute('href')).toMatch(/#two$/);

    document.body.removeChild(article);
  });
});
