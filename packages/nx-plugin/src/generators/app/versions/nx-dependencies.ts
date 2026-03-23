import { clean, lt } from 'semver';
import { stripIndents } from '@nx/devkit';
import {
  V17_X_NX_ANGULAR,
  V17_X_NX_DEVKIT,
  V17_X_NX_LINTER,
} from './nx_17_X/versions';
import {
  V18_X_NX_ANGULAR,
  V18_X_NX_DEVKIT,
  V18_X_NX_LINTER,
} from './nx_18_X/versions';

const nxDependencyKeys = ['@nx/devkit', '@nx/angular', '@nx/eslint'] as const;
export type NxDependency = (typeof nxDependencyKeys)[number];

export const getNxDependencies = (
  nxVersion: string,
): Record<NxDependency, string> => {
  const escapedNxVersion: string = clean(nxVersion) ?? nxVersion;

  if (lt(escapedNxVersion, '17.0.0')) {
    throw new Error(
      stripIndents`Nx v17.0.0 or newer is required to install Analog`,
    );
  }

  // install 17.0 deps for versions < 18.0.0
  if (lt(escapedNxVersion, '18.0.0')) {
    return {
      '@nx/angular': V17_X_NX_ANGULAR,
      '@nx/devkit': V17_X_NX_DEVKIT,
      '@nx/eslint': V17_X_NX_LINTER,
    };
  }

  // return latest for >= 18.0.0
  return {
    '@nx/angular': V18_X_NX_ANGULAR,
    '@nx/devkit': V18_X_NX_DEVKIT,
    '@nx/eslint': V18_X_NX_LINTER,
  };
};
