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

const nrwlDependencyKeys = [
  '@nrwl/devkit',
  '@nrwl/angular',
  '@nrwl/linter',
] as const;
export type NrwlDependency = (typeof nrwlDependencyKeys)[number];
export const getNrwlDependencies = (
  nxVersion: string,
): Record<NrwlDependency, string> => {
  const escapedNxVersion = clean(nxVersion);

  // fail out for versions <17.0.0
  if (lt(escapedNxVersion, '17.0.0')) {
    throw new Error(
      stripIndents`Nx v17.0.0 or newer is required to install Analog`,
    );
  }
  // error for @nrwl to @nx namespace change for Nx >= 17
  throw new Error(
    stripIndents`As of Nx 17.0.0 the @nrwl scope has been replaced with the @nx scope. Please use @nx scope to install version ${nxVersion}`,
  );
};

const nxDependencyKeys = ['@nx/devkit', '@nx/angular', '@nx/eslint'] as const;
export type NxDependency = (typeof nxDependencyKeys)[number];
export const getNxDependencies = (
  nxVersion: string,
): Record<NxDependency, string> => {
  const escapedNxVersion = clean(nxVersion);

  // error for @nrwl to @nx namespace changes for Nx < 17
  if (lt(escapedNxVersion, '17.0.0')) {
    throw new Error(
      stripIndents`The @nx scope is only supported in Nx 17.0.0 and newer. Please use @nrwl scope to install version ${nxVersion}`,
    );
  }

  // install 17.0 deps for versions =< 18.0.0
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
