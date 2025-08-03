import React from 'react';
import Head from '@docusaurus/Head';

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string[];
  image?: string;
  url?: string;
  type?: 'website' | 'article' | 'documentation';
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
  section?: string;
  tags?: string[];
  canonicalUrl?: string;
}

export default function SEO({
  title,
  description,
  keywords = [],
  image = 'https://analogjs.org/img/analog-banner.png',
  url,
  type = 'documentation',
  author = 'Analog Team',
  publishedTime,
  modifiedTime,
  section,
  tags = [],
  canonicalUrl,
}: SEOProps) {
  const siteTitle = title
    ? `${title} | Analog`
    : 'Analog - The fullstack Angular meta-framework';
  const siteDescription =
    description ||
    'Analog is a fullstack meta-framework for building applications and websites with Angular. Modern tooling, file-based routing, SSR/SSG, and more.';

  // Base JSON-LD structure
  const baseJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: siteTitle,
    description: siteDescription,
    url: url || 'https://analogjs.org',
    publisher: {
      '@type': 'Organization',
      name: 'Analog',
      url: 'https://analogjs.org',
      logo: {
        '@type': 'ImageObject',
        url: 'https://analogjs.org/img/logos/analog-logo.svg',
      },
    },
    mainEntity: {
      '@type': 'SoftwareApplication',
      name: 'Analog',
      description: 'The fullstack Angular meta-framework',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Web',
      url: 'https://analogjs.org',
    },
  };

  // Enhanced JSON-LD for articles/documentation
  const articleJsonLd =
    type === 'article'
      ? {
          '@context': 'https://schema.org',
          '@type': 'TechArticle',
          headline: title,
          description: siteDescription,
          image: image,
          author: {
            '@type': 'Person',
            name: author,
          },
          publisher: {
            '@type': 'Organization',
            name: 'Analog',
            url: 'https://analogjs.org',
            logo: {
              '@type': 'ImageObject',
              url: 'https://analogjs.org/img/logos/analog-logo.svg',
            },
          },
          datePublished: publishedTime,
          dateModified: modifiedTime,
          articleSection: section,
          keywords: [
            ...keywords,
            'Angular',
            'Analog',
            'meta-framework',
            'fullstack',
            'SSR',
            'SSG',
          ],
          mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': url || 'https://analogjs.org',
          },
        }
      : null;

  // Breadcrumb JSON-LD
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://analogjs.org',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Documentation',
        item: 'https://analogjs.org/docs',
      },
      ...(section
        ? [
            {
              '@type': 'ListItem',
              position: 3,
              name: section,
              item: url || 'https://analogjs.org/docs',
            },
          ]
        : []),
    ],
  };

  // Organization JSON-LD
  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Analog',
    url: 'https://analogjs.org',
    logo: 'https://analogjs.org/img/logos/analog-logo.svg',
    description: 'The fullstack Angular meta-framework',
    sameAs: ['https://github.com/analogjs/analog', 'https://chat.analogjs.org'],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      url: 'https://github.com/analogjs/analog/issues',
    },
  };

  return (
    <Head>
      {/* Basic Meta Tags */}
      <title>{siteTitle}</title>
      <meta name="description" content={siteDescription} />
      {keywords.length > 0 && (
        <meta name="keywords" content={keywords.join(', ')} />
      )}

      {/* Open Graph */}
      <meta property="og:title" content={siteTitle} />
      <meta property="og:description" content={siteDescription} />
      <meta property="og:image" content={image} />
      <meta property="og:url" content={url || 'https://analogjs.org'} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content="Analog" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={siteTitle} />
      <meta name="twitter:description" content={siteDescription} />
      <meta name="twitter:image" content={image} />
      <meta name="twitter:site" content="@analogjs" />

      {/* Canonical URL */}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}

      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(baseJsonLd),
        }}
      />

      {articleJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(articleJsonLd),
          }}
        />
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbJsonLd),
        }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationJsonLd),
        }}
      />
    </Head>
  );
}
