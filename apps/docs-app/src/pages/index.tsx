import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import StackblitzButton from '@site/src/components/StackblitzButton';
import Translate, { translate } from '@docusaurus/Translate';
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
        <p className="hero__subtitle">
          {translate({
            message: siteConfig.tagline,
            id: 'homepage.tagline',
            description: 'The tagline of the homepage',
          })}
        </p>
        <div className={styles.buttons}>
          <Link
            className={clsx(
              'button button--secondary button--lg',
              styles.readDocsButton
            )}
            to="/docs"
          >
            <Translate
              id="homepage.readDocs"
              description="The label of the button to read the docs"
            >
              Read the Docs
            </Translate>
          </Link>
          <StackblitzButton />
        </div>
      </div>
    </header>
  );
}

function SponsorSection() {
  // Define your light and dark theme logos
  const lightThemeLogo = 'https://link-to-light-theme-logo';
  const darkThemeLogo = 'https://link-to-dark-theme-logo';

  return (
    <section className={clsx('hero', styles.heroBanner, styles.horizontal)}>
      <div className="container">
        <h3>
          <Translate
            id="homepage.sponsorSection.title"
            description="The title of the sponsor section"
          >
            Analog is free, open source, and supported by our sponsors.
          </Translate>
        </h3>
        <p className="hero__subtitle">
          <Translate
            id="homepage.sponsorSection.subtitle"
            description="The subtitle of the sponsor section on the homepage"
          >
            Sponsors
          </Translate>
        </p>

        <div className={styles.horizontalSponsors}>
          <a
            href="https://github.blog/2023-04-12-github-accelerator-our-first-cohort-and-whats-next/"
            target="_blank"
          >
            <img
              src="../img/logos/github-logo.svg"
              alt="GitHub Accelerator"
              style={{ marginRight: '30px', width: '80px', height: '100px' }}
            />
          </a>

          <a href="https://nx.dev" target="_blank">
            <img
              src="./img/logos/nx-logo.light.svg"
              alt="NX Dev"
              style={{ marginRight: '30px', width: '100px', height: '100px' }}
            />
          </a>

          <a href="https://snyder.tech" target="_blank">
            <img
              src="./img/logos/snyder-logo.light.svg"
              alt="Snyder Tech"
              style={{ marginRight: '30px', width: '250px', height: '100px' }}
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
            <Translate
              id="homepage.sponsorSection.sponsorButton"
              description="The label of the button to sponsor Analog"
            >
              Sponsor Analog
            </Translate>
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description={translate({
        message: siteConfig.tagline,
        id: 'homepage.description',
        description: 'The description of the homepage',
      })}
    >
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
      <SponsorSection />
    </Layout>
  );
}
