import { Component } from '@angular/core';
import type { RouteMeta } from '@analogjs/router';
import type { WithContext, Article } from 'schema-dts';

// Route metadata for Angular Router
export const routeMeta: RouteMeta = {
  title: 'Example Article',
  data: {
    description: 'An example article demonstrating JSON-LD structured data',
  },
};

// JSON-LD structured data for SEO
export const routeJsonLd: WithContext<Article> = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'How to Use JSON-LD with AnalogJS',
  description:
    'Learn how to add structured data to your AnalogJS routes for better SEO',
  author: {
    '@type': 'Person',
    name: 'John Doe',
    url: 'https://example.com/authors/john-doe',
  },
  datePublished: '2024-01-30',
  dateModified: '2024-01-30',
  publisher: {
    '@type': 'Organization',
    name: 'AnalogJS Blog',
    logo: {
      '@type': 'ImageObject',
      url: 'https://example.com/logo.png',
    },
  },
  image: {
    '@type': 'ImageObject',
    url: 'https://example.com/article-image.jpg',
    width: {
      '@type': 'QuantitativeValue',
      value: 1200,
      unitCode: 'PX',
    } as const,
    height: {
      '@type': 'QuantitativeValue',
      value: 630,
      unitCode: 'PX',
    } as const,
  },
  mainEntityOfPage: {
    '@type': 'WebPage',
    '@id': 'https://example.com/articles/json-ld-analogjs',
  },
};

@Component({
  selector: 'app-article',
  standalone: true,
  template: `
    <article>
      <h1>How to Use JSON-LD with AnalogJS</h1>
      <p>
        This page demonstrates how to export structured data using schema-dts.
      </p>

      <section>
        <h2>What is JSON-LD?</h2>
        <p>
          JSON-LD (JavaScript Object Notation for Linked Data) is a method of
          encoding linked data using JSON. It's used by search engines to better
          understand the content of your pages.
        </p>
      </section>

      <section>
        <h2>Benefits</h2>
        <ul>
          <li>Better SEO rankings</li>
          <li>Rich snippets in search results</li>
          <li>Type-safe with schema-dts</li>
        </ul>
      </section>
    </article>
  `,
  styles: [
    `
      article {
        max-width: 800px;
        margin: 0 auto;
        padding: 2rem;
      }

      h1 {
        font-size: 2.5rem;
        margin-bottom: 1rem;
      }

      h2 {
        font-size: 1.8rem;
        margin-top: 2rem;
        margin-bottom: 1rem;
      }

      section {
        margin-bottom: 2rem;
      }
    `,
  ],
})
export default class ArticlePageComponent {}
