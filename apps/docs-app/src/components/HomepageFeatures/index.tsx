import clsx from 'clsx';
import React from 'react';
import styles from './styles.module.css';
import Translate, { translate } from '@docusaurus/Translate';

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  png?: string;
  description: JSX.Element;
};

const FeatureList: FeatureItem[] = [
  {
    title: translate({
      message: 'Vite-powered',
      id: 'features.title.vitePowered',
      description: 'The title of the feature "Vite-powered"',
    }),
    Svg: require('@site/static/img/logos/vite-logo.svg').default,
    description: (
      <>
        <Translate
          id="features.vite"
          description="The description of the feature 'Vite-powered'"
        >
          Analog uses Vite for serving and building as well as Vitest for
          testing.
        </Translate>
      </>
    ),
  },
  {
    title: translate({
      message: 'Hybrid SSR/SSG support',
      id: 'features.title.hybridSSR',
      description: 'The title of the feature "Hybrid SSR/SSG support"',
    }),
    Svg: require('@site/static/img/logos/angular-logo.svg').default,
    png: '/img/logos/angular-gradient.png',
    description: (
      <>
        <Translate
          id="features.hybridSSR"
          description="The description of the feature 'Hybrid SSR/SSG support'"
        >
          Analog supports both Server-Side Rendering (SSR) and Static Site
          Generation (SSG) of Angular applications.
        </Translate>
      </>
    ),
  },
  {
    title: translate({
      message: 'File-based routing and API routes',
      id: 'features.title.fileBasedRouting',
      description:
        'The title of the feature "File-based routing and API routes"',
    }),
    Svg: require('@site/static/img/logos/analog-logo.svg').default,
    description: (
      <>
        <Translate
          id="features.fileBasedRouting"
          description="The description of the feature 'File-based routing and API routes'"
        >
          Analog uses file-based routing and supports API (server) routes for
          Angular applications.
        </Translate>
      </>
    ),
  },
];

function Feature({ title, Svg, description, png }: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        {!png && <Svg className={styles.featureSvg} role="img" />}
        {png && <img src={png} className={styles.featureSvg} role="img" />}
      </div>
      <div className="text--center padding-horiz--md">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): JSX.Element {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
