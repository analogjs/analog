import clsx from 'clsx';
import React from 'react';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: JSX.Element;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Vite-powered',
    Svg: require('@site/static/img/logos/vite-logo.svg').default,
    description: (
      <>
        Analog uses Vite for serving and building as well as Vitest for testing.
      </>
    ),
  },
  {
    title: 'Hybrid SSR/SSG support',
    Svg: require('@site/static/img/logos/angular-logo.svg').default,
    description: (
      <>
        Analog supports both Server-Side Rendering (SSR) and Static Site
        Generation (SSG) of Angular applications.
      </>
    ),
  },
  {
    title: 'File-based routing',
    Svg: require('@site/static/img/logos/analog-logo.svg').default,
    description: (
      <>
        Analog uses file-based routing for server-side rendered Angular
        applications. Analog also includes support for API (server) routes.
      </>
    ),
  },
];

function Feature({ title, Svg, description }: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
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
