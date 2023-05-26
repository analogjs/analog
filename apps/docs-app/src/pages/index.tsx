import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import StackblitzButton from '@site/src/components/StackblitzButton';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import React from 'react';

import styles from './index.module.css';

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx('hero', styles.heroBanner)}>
      <div className="container">
        <h1 className="hero__title">{siteConfig.title}</h1>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className={clsx(
              'button button--secondary button--lg',
              styles.readDocsButton
            )}
            to="/docs"
          >
            Read the docs
          </Link>
          <StackblitzButton />
        </div>
      </div>
    </header>
  );
}

function SponsorSection() {
  return (
    <section className={clsx('hero', styles.heroBanner)}>
      <div className="container">
        <h3>Analog is free, open source, and supported by our sponsors.</h3>
        <p className="hero__subtitle">Sponsors</p>

        <div>
          <a
            href="https://github.blog/2023-04-12-github-accelerator-our-first-cohort-and-whats-next/"
            target="_blank"
          >
            <img
              src="https://raw.githubusercontent.com/analogjs/analog/main/apps/docs-app/static/img/logos/github-logo.svg"
              width="100px"
              height="100px"
              alt="GitHub Accelerator"
            />
          </a>
        </div>

        <br />

        <div className={styles.buttons}>
          <Link
            className={clsx(
              'button button--secondary button--lg',
              styles.sponsorButton
            )}
            href="https://github.com/sponsors/brandonroberts"
          >
            Sponsor Analog
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
      <SponsorSection />
    </Layout>
  );
}
