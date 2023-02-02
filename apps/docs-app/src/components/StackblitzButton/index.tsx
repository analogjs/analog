import Link from '@docusaurus/Link';
import clsx from 'clsx';
import React from 'react';
import styles from './styles.module.css';

const StackblitzLogo: React.ComponentType<React.ComponentProps<'svg'>> =
  require('@site/static/img/logos/stackblitz-logo.svg').default;

export default function StackblitzButton(props): JSX.Element {
  return (
    <Link
      {...props}
      className={clsx(
        props.className,
        'button button--secondary button--lg',
        styles.flex
      )}
      to="https://analogjs.org/new"
    >
      <StackblitzLogo className={styles.logoSvg} role="img" />
      Open in StackBlitz
    </Link>
  );
}
