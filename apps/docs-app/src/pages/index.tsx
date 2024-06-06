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
              src="https://raw.githubusercontent.com/analogjs/analog/main/apps/docs-app/static/img/logos/github-logo.svg"
              width="100px"
              height="100px"
              alt="GitHub Accelerator"
              style={{ marginRight: '20px' }}
            />
          </a>

          <a href="https://nx.dev" target="_blank">
            <svg
              role="img"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              fill="#FFFFFF"
              aria-hidden="true"
              style={{ marginRight: '20px', width: '100px', height: '100px' }}
            >
              <title>Nx</title>
              <path d="m12 14.1-3.1 5-5.2-8.5v8.9H0v-15h3.7l5.2 8.9v-4l3 4.7zm.6-5.7V4.5H8.9v3.9h3.7zm5.6 4.1a2 2 0 0 0-2 1.3 2 2 0 0 1 2.4-.7c.4.2 1 .4 1.3.3a2.1 2.1 0 0 0-1.7-.9zm3.4 1c-.4 0-.8-.2-1.1-.6l-.2-.3a2.1 2.1 0 0 0-.5-.6 2 2 0 0 0-1.2-.3 2.5 2.5 0 0 0-2.3 1.5 2.3 2.3 0 0 1 4 .4.8.8 0 0 0 .9.3c.5 0 .4.4 1.2.5v-.1c0-.4-.3-.5-.8-.7zm2 1.3a.7.7 0 0 0 .4-.6c0-3-2.4-5.5-5.4-5.5a5.4 5.4 0 0 0-4.5 2.4l-1.5-2.4H8.9l3.5 5.4L9 19.5h3.6L14 17l1.6 2.4h3.5l-3.1-5a.7.7 0 0 1 0-.3 2.7 2.7 0 0 1 2.6-2.7c1.5 0 1.7.9 2 1.3.7.8 2 .5 2 1.5a.7.7 0 0 0 1 .6zm.4.2c-.2.3-.6.3-.8.6-.1.3.1.4.1.4s.4.2.6-.3V15z"></path>
            </svg>
          </a>

          <a href="https://snyder.tech" target="_blank">
            <img
              src="https://camo.githubusercontent.com/510635f8c9545f3b94b2a9ca5c8e23c035a3c61f4f9b481a09d799c7209e507f/68747470733a2f2f6d656469612e6c6963646e2e636f6d2f646d732f696d6167652f433445304241514734684d764c7a6e74365f512f636f6d70616e792d6c6f676f5f3230305f3230302f302f313633303631383331313034312f736e79646572746563686e6f6c6f676965735f6c6f676f3f653d3231343734383336343726763d6265746126743d54467136564b57416762356f4930466d627661655450467a4d4a52395339345f4c766e4c6e6c5271664c49"
              width="100px"
              height="100px"
              alt="SnyderTechLogo"
              style={{ marginRight: '20px' }}
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
