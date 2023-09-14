import Link from '@docusaurus/Link';
import clsx from 'clsx';
import React from 'react';
import styles from './styles.module.css';
import Translate from '@docusaurus/Translate';

const StackblitzLogo: React.ComponentType<React.ComponentProps<'svg'>> =
  require('@site/static/img/logos/stackblitz-logo.svg').default;

export default function StackblitzButton(): JSX.Element {
  return (
    <Link
      className={clsx(
        'button button--outline button--lg',
        styles.stackblitzLink
      )}
      to="https://analogjs.org/new"
    >
      <StackblitzLogo className={styles.logoSvg} role="img" />
      <Translate
        id="homepage.stackblitzButton.text"
        description="The text of the StackBlitz button on the homepage"
      >
        Open in StackBlitz
      </Translate>
    </Link>
  );
}
