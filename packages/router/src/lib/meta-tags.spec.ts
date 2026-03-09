import { Component, ENVIRONMENT_INITIALIZER } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import {
  provideRouter,
  Route,
  Router,
  RouterOutlet,
  ROUTES,
} from '@angular/router';
import { provideLocationMocks } from '@angular/common/testing';
import { map, timer } from 'rxjs';
import {
  MetaTag,
  ROUTE_META_TAGS_KEY,
  updateMetaTagsOnRouteChange,
} from './meta-tags';

describe('updateMetaTagsOnRouteChange', () => {
  function setup() {
    @Component({
      standalone: true,
      imports: [RouterOutlet],
      template: '<router-outlet></router-outlet>',
    })
    class TestComponent {}

    const parentMetaTagValues = {
      charset: 'utf-8',
      httpEquivRefresh: '1000',
      description: 'Parent Description',
      keywords: 'Analog, Angular',
      ogTitle: 'Parent Og:Title',
      ogImage: 'https://example.com',
      itempropName: 'Parent Name',
      itempropImage: 'https://example.com/parent.jpg',
    };

    const childMetaTagValues = {
      charset: 'ascii',
      httpEquivRefresh: '3000',
      httpEquivContentSec: "default-src 'self'",
      description: 'Child Description',
      author: 'Analog Team',
      ogTitle: 'Child Og:Title',
      ogDescription: 'Child Og:Description',
      itempropName: 'Child Name',
      itempropDescription: 'Child itemprop description',
    };

    const routes: Route[] = [
      {
        path: '',
        component: TestComponent,
        data: {
          [ROUTE_META_TAGS_KEY]: [
            { charset: parentMetaTagValues.charset },
            {
              httpEquiv: 'refresh',
              content: parentMetaTagValues.httpEquivRefresh,
            },
            { name: 'description', content: parentMetaTagValues.description },
            { name: 'keywords', content: parentMetaTagValues.keywords },
            { property: 'og:title', content: parentMetaTagValues.ogTitle },
            { property: 'og:image', content: parentMetaTagValues.ogImage },
            { itemprop: 'name', content: parentMetaTagValues.itempropName },
            { itemprop: 'image', content: parentMetaTagValues.itempropImage },
          ] as MetaTag[],
        },
        children: [
          {
            path: 'child',
            component: TestComponent,
            resolve: {
              [ROUTE_META_TAGS_KEY]: () =>
                timer(1000).pipe(
                  map(
                    () =>
                      [
                        { charset: childMetaTagValues.charset },
                        {
                          httpEquiv: 'refresh',
                          content: childMetaTagValues.httpEquivRefresh,
                        },
                        {
                          httpEquiv: 'content-security-policy',
                          content: childMetaTagValues.httpEquivContentSec,
                        },
                        {
                          name: 'description',
                          content: childMetaTagValues.description,
                        },
                        { name: 'author', content: childMetaTagValues.author },
                        {
                          property: 'og:title',
                          content: childMetaTagValues.ogTitle,
                        },
                        {
                          property: 'og:description',
                          content: childMetaTagValues.ogDescription,
                        },
                        {
                          itemprop: 'name',
                          content: childMetaTagValues.itempropName,
                        },
                        {
                          itemprop: 'description',
                          content: childMetaTagValues.itempropDescription,
                        },
                      ] as MetaTag[],
                  ),
                ),
            },
          },
        ],
      },
    ];

    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideLocationMocks(),
        {
          provide: ENVIRONMENT_INITIALIZER,
          multi: true,
          useValue: () => updateMetaTagsOnRouteChange(),
        },
      ],
    });

    const router = TestBed.inject(Router);
    const document = TestBed.inject(DOCUMENT);

    const getMetaElements = () => ({
      charset: document.querySelector('meta[charset]') as HTMLMetaElement,
      httpEquivRefresh: document.querySelector(
        'meta[http-equiv="refresh"]',
      ) as HTMLMetaElement,
      httpEquivContentSec: document.querySelector(
        'meta[http-equiv="content-security-policy"]',
      ) as HTMLMetaElement,
      description: document.querySelector(
        'meta[name="description"]',
      ) as HTMLMetaElement,
      keywords: document.querySelector(
        'meta[name="keywords"]',
      ) as HTMLMetaElement,
      author: document.querySelector('meta[name="author"]') as HTMLMetaElement,
      ogTitle: document.querySelector(
        'meta[property="og:title"]',
      ) as HTMLMetaElement,
      ogDescription: document.querySelector(
        'meta[property="og:description"]',
      ) as HTMLMetaElement,
      ogImage: document.querySelector(
        'meta[property="og:image"]',
      ) as HTMLMetaElement,
      itempropName: document.querySelector(
        'meta[itemprop="name"]',
      ) as HTMLMetaElement,
      itempropImage: document.querySelector(
        'meta[itemprop="image"]',
      ) as HTMLMetaElement,
      itempropDescription: document.querySelector(
        'meta[itemprop="description"]',
      ) as HTMLMetaElement,
    });

    return { router, getMetaElements, parentMetaTagValues, childMetaTagValues };
  }

  it('adds meta tags on initial navigation', async () => {
    const { router, getMetaElements, parentMetaTagValues } = setup();

    await router.navigateByUrl('/');

    const metaElements = getMetaElements();

    expect(metaElements.charset.getAttribute('charset')).toBe(
      parentMetaTagValues.charset,
    );
    expect(metaElements.httpEquivRefresh.content).toBe(
      parentMetaTagValues.httpEquivRefresh,
    );
    expect(metaElements.description.content).toBe(
      parentMetaTagValues.description,
    );
    expect(metaElements.keywords.content).toBe(parentMetaTagValues.keywords);
    expect(metaElements.ogTitle.content).toBe(parentMetaTagValues.ogTitle);
    expect(metaElements.ogImage.content).toBe(parentMetaTagValues.ogImage);
    expect(metaElements.itempropName.content).toBe(
      parentMetaTagValues.itempropName,
    );
    expect(metaElements.itempropImage.content).toBe(
      parentMetaTagValues.itempropImage,
    );
  });

  it('merges parent and child meta tags on child route navigation', async () => {
    const { router, getMetaElements, parentMetaTagValues, childMetaTagValues } =
      setup();

    await router.navigateByUrl('/child');

    const metaElements = getMetaElements();
    expect(metaElements.charset.getAttribute('charset')).toBe(
      childMetaTagValues.charset,
    );
    expect(metaElements.httpEquivRefresh.content).toBe(
      childMetaTagValues.httpEquivRefresh,
    );
    expect(metaElements.httpEquivContentSec.content).toBe(
      childMetaTagValues.httpEquivContentSec,
    );
    expect(metaElements.description.content).toBe(
      childMetaTagValues.description,
    );
    expect(metaElements.author.content).toBe(childMetaTagValues.author);
    expect(metaElements.ogTitle.content).toBe(childMetaTagValues.ogTitle);
    expect(metaElements.ogDescription.content).toBe(
      childMetaTagValues.ogDescription,
    );
    expect(metaElements.itempropName.content).toBe(
      childMetaTagValues.itempropName,
    );
    expect(metaElements.itempropDescription.content).toBe(
      childMetaTagValues.itempropDescription,
    );
    // meta tags inherited from parent route
    expect(metaElements.keywords.content).toBe(parentMetaTagValues.keywords);
    expect(metaElements.ogImage.content).toBe(parentMetaTagValues.ogImage);
    expect(metaElements.itempropImage.content).toBe(
      parentMetaTagValues.itempropImage,
    );
  });

  it('lefts over meta tags from the previous route that are not changed', async () => {
    const { router, getMetaElements, parentMetaTagValues, childMetaTagValues } =
      setup();

    await router.navigateByUrl('/child');

    await router.navigateByUrl('/');

    const metaElements = getMetaElements();
    expect(metaElements.charset.getAttribute('charset')).toBe(
      parentMetaTagValues.charset,
    );
    expect(metaElements.description.content).toBe(
      parentMetaTagValues.description,
    );
    expect(metaElements.keywords.content).toBe(parentMetaTagValues.keywords);
    expect(metaElements.httpEquivRefresh.content).toBe(
      parentMetaTagValues.httpEquivRefresh,
    );
    expect(metaElements.ogTitle.content).toBe(parentMetaTagValues.ogTitle);
    expect(metaElements.ogImage.content).toBe(parentMetaTagValues.ogImage);
    expect(metaElements.itempropName.content).toBe(
      parentMetaTagValues.itempropName,
    );
    expect(metaElements.itempropImage.content).toBe(
      parentMetaTagValues.itempropImage,
    );
    // meta tags that are not changed
    expect(metaElements.httpEquivContentSec.content).toBe(
      childMetaTagValues.httpEquivContentSec,
    );
    expect(metaElements.author.content).toBe(childMetaTagValues.author);
    expect(metaElements.ogDescription.content).toBe(
      childMetaTagValues.ogDescription,
    );
    expect(metaElements.itempropDescription.content).toBe(
      childMetaTagValues.itempropDescription,
    );
  });
});
