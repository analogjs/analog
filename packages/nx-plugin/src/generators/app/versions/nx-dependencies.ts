import { clean, lt } from 'semver';
import { stripIndents } from '@nx/devkit';
import {
  V16_X_NX_DEVKIT,
  V16_X_NX_ANGULAR,
  V16_X_NX_LINTER,
} from './nx_16_X/versions';
import {
  V15_X_NRWL_DEVKIT,
  V15_X_NX_DEVKIT,
  V15_X_NRWL_ANGULAR,
  V15_X_NX_ANGULAR,
  V15_X_NX_LINTER,
  V15_X_NRWL_LINTER,
} from './nx_15_X/versions';
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

  // fail out for versions <15.2.0
  if (lt(escapedNxVersion, '15.2.0')) {
    throw new Error(
      stripIndents`Nx v15.2.0 or newer is required to install Analog`,
    );
  }

  // install 15.8 deps for versions 15.8.0 =< 16.0.0
  if (lt(escapedNxVersion, '16.0.0')) {
    return {
      '@nrwl/angular': V15_X_NRWL_ANGULAR,
      '@nrwl/devkit': V15_X_NRWL_DEVKIT,
      '@nrwl/linter': V15_X_NRWL_LINTER,
    };
  }

  // error for @nrwl to @nx namespace change for Nx >= 16
  throw new Error(
    stripIndents`As of Nx 16.0.0 the @nrwl scope has been replaced with the @nx scope. Please use @nx scope to install version ${nxVersion}`,
  );
};

const nxDependencyKeys = ['@nx/devkit', '@nx/angular', '@nx/eslint'] as const;
export type NxDependency = (typeof nxDependencyKeys)[number];
export const getNxDependencies = (
  nxVersion: string,
): Record<NxDependency, string> => {
  const escapedNxVersion = clean(nxVersion);

  // error for @nrwl to @nx namespace changes for Nx < 16
  if (lt(escapedNxVersion, '16.0.0')) {
    throw new Error(
      stripIndents`The @nx scope is only supported in Nx 16.0.0 and newer. Please use @nrwl scope to install version ${nxVersion}`,
    );
  }

  // install 16.0 deps for versions 16.0.0 =< 16.1.0
  if (lt(escapedNxVersion, '16.1.0')) {
    return {
      '@nx/angular': V15_X_NX_ANGULAR,
      '@nx/devkit': V15_X_NX_DEVKIT,
      '@nx/eslint': V15_X_NX_LINTER,
    };
  }

  // install 16.0 deps for versions =< 17.0.0
  if (lt(escapedNxVersion, '17.0.0')) {
    return {
      '@nx/angular': V16_X_NX_ANGULAR,
      '@nx/devkit': V16_X_NX_DEVKIT,
      '@nx/eslint': V16_X_NX_LINTER,
    };
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
