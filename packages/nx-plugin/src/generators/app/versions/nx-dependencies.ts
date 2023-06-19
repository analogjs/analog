import { gt, clean } from 'semver';
import { V_LATEST_NX_ANGULAR, V_LATEST_NX_DEVKIT } from './latest/versions';
import { V16_1_0_NX_ANGULAR, V16_1_0_NX_DEVKIT } from './nx_16_1_0/versions';
import {
  V15_8_0_NRWL_ANGULAR,
  V15_8_0_NRWL_DEVKIT,
} from './nx_15_8_0/versions';
import {
  V15_2_0_NRWL_ANGULAR,
  V15_2_0_NRWL_DEVKIT,
} from './nx_15_2_0/versions';

const nrwlDependencyKeys = ['@nrwl/devkit', '@nrwl/angular'] as const;
export type NrwlDependency = (typeof nrwlDependencyKeys)[number];
export const getNrwlDependencies = (
  nxVersion: string
): Record<NrwlDependency, string> => {
  const escapedNxVersion = clean(nxVersion);
  if (gt(escapedNxVersion, '16.1.0')) {
    return {
      '@nrwl/angular': V_LATEST_NX_ANGULAR,
      '@nrwl/devkit': V_LATEST_NX_DEVKIT,
    };
  }
  if (gt(escapedNxVersion, '15.8.0')) {
    return {
      '@nrwl/angular': V16_1_0_NX_ANGULAR,
      '@nrwl/devkit': V16_1_0_NX_DEVKIT,
    };
  }
  if (gt(escapedNxVersion, '15.2.0')) {
    return {
      '@nrwl/angular': V15_8_0_NRWL_ANGULAR,
      '@nrwl/devkit': V15_8_0_NRWL_DEVKIT,
    };
  }
  if (gt(escapedNxVersion, '15.0.0')) {
    return {
      '@nrwl/angular': V15_2_0_NRWL_ANGULAR,
      '@nrwl/devkit': V15_2_0_NRWL_DEVKIT,
    };
  }
};

const nxDependencyKeys = ['@nx/devkit', '@nx/angular'] as const;
export type NxDependency = (typeof nxDependencyKeys)[number];
export const getNxDependencies = (
  nxVersion: string
): Record<NxDependency, string> => {
  const escapedNxVersion = clean(nxVersion);

  if (gt(escapedNxVersion, '16.1.0')) {
    return {
      '@nx/angular': V_LATEST_NX_ANGULAR,
      '@nx/devkit': V_LATEST_NX_DEVKIT,
    };
  }
  if (gt(escapedNxVersion, '15.8.0')) {
    return {
      '@nx/angular': V16_1_0_NX_ANGULAR,
      '@nx/devkit': V16_1_0_NX_DEVKIT,
    };
  }
  if (gt(escapedNxVersion, '15.2.0')) {
    return {
      '@nx/angular': V15_8_0_NRWL_ANGULAR,
      '@nx/devkit': V15_8_0_NRWL_DEVKIT,
    };
  }
  if (gt(escapedNxVersion, '15.0.0')) {
    return {
      '@nx/angular': V15_2_0_NRWL_ANGULAR,
      '@nx/devkit': V15_2_0_NRWL_DEVKIT,
    };
  }
};
