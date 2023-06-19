import { gt } from 'semver';
import {
  V16_1_0_ANALOG_JS_PLATFORM,
  V16_1_0_JSDOM,
  V16_1_0_NX_VITE,
  V16_1_0_TYPESCRIPT,
  V16_1_0_VITE,
  V16_1_0_VITE_TSCONFIG_PATHS,
  V16_1_0_VITEST,
} from './nx_16_1_0/versions';
import {
  V15_8_0_ANALOG_JS_PLATFORM,
  V15_8_0_JSDOM,
  V15_8_0_NRWL_VITE,
  V15_8_0_TYPESCRIPT,
  V15_8_0_VITE,
  V15_8_0_VITE_TSCONFIG_PATHS,
  V15_8_0_VITEST,
} from './nx_15_8_0/versions';
import {
  V_LATEST_ANALOG_JS_PLATFORM,
  V_LATEST_JSDOM,
  V_LATEST_NX_VITE,
  V_LATEST_TYPESCRIPT,
  V_LATEST_VITE,
  V_LATEST_VITE_TSCONFIG_PATHS,
  V_LATEST_VITEST,
} from './latest/versions';
import {
  V15_2_0_ANALOG_JS_PLATFORM,
  V15_2_0_JSDOM,
  V15_2_0_NRWL_VITE,
  V15_2_0_TYPESCRIPT,
  V15_2_0_VITE,
  V15_2_0_VITE_TSCONFIG_PATHS,
  V15_2_0_VITEST,
} from './nx_15_2_0/versions';

const devDependencyKeys = [
  '@analogjs/platform',
  'jsdom',
  'typescript',
  'vite',
  'vite-tsconfig-paths',
  'vitest',
] as const;
export type AnalogDevDependency = (typeof devDependencyKeys)[number];

export const getAnalogDevDependencies = (
  nxVersion: string
): Record<AnalogDevDependency, string> => {
  const escapedNxVersion = nxVersion.replace(/[~^]/, '');

  const nxViteDependency = getViteDependency(escapedNxVersion);
  const devDependencies = getDevDependencies(escapedNxVersion);

  return { ...nxViteDependency, ...devDependencies };
};

const getViteDependency = (escapedNxVersion: string) => {
  if (gt(escapedNxVersion, '16.1.0')) {
    return {
      '@nx/vite': V_LATEST_NX_VITE,
    };
  }
  if (gt(escapedNxVersion, '15.8.0')) {
    return {
      '@nx/vite': V16_1_0_NX_VITE,
    };
  }
  if (gt(escapedNxVersion, '15.2.0')) {
    return {
      '@nrwl/vite': V15_8_0_NRWL_VITE,
    };
  }
  if (gt(escapedNxVersion, '15.0.0')) {
    return {
      '@nrwl/vite': V15_2_0_NRWL_VITE,
    };
  }
  throw Error(
    `Unsupported Nx version detected: ${escapedNxVersion}. Make sure to at least have V_LATEST.2.0 installed.`
  );
};

const getDevDependencies = (escapedNxVersion: string) => {
  if (gt(escapedNxVersion, '16.1.0')) {
    return {
      '@analogjs/platform': V_LATEST_ANALOG_JS_PLATFORM,
      jsdom: V_LATEST_JSDOM,
      typescript: V_LATEST_TYPESCRIPT,
      vite: V_LATEST_VITE,
      'vite-tsconfig-paths': V_LATEST_VITE_TSCONFIG_PATHS,
      vitest: V_LATEST_VITEST,
    };
  }
  if (gt(escapedNxVersion, '15.8.0')) {
    return {
      '@analogjs/platform': V16_1_0_ANALOG_JS_PLATFORM,
      jsdom: V16_1_0_JSDOM,
      typescript: V16_1_0_TYPESCRIPT,
      vite: V16_1_0_VITE,
      'vite-tsconfig-paths': V16_1_0_VITE_TSCONFIG_PATHS,
      vitest: V16_1_0_VITEST,
    };
  }
  if (gt(escapedNxVersion, '15.2.0')) {
    return {
      '@analogjs/platform': V15_8_0_ANALOG_JS_PLATFORM,
      jsdom: V15_8_0_JSDOM,
      typescript: V15_8_0_TYPESCRIPT,
      vite: V15_8_0_VITE,
      'vite-tsconfig-paths': V15_8_0_VITE_TSCONFIG_PATHS,
      vitest: V15_8_0_VITEST,
    };
  }
  if (gt(escapedNxVersion, '15.0.0')) {
    return {
      '@analogjs/platform': V15_2_0_ANALOG_JS_PLATFORM,
      jsdom: V15_2_0_JSDOM,
      typescript: V15_2_0_TYPESCRIPT,
      vite: V15_2_0_VITE,
      'vite-tsconfig-paths': V15_2_0_VITE_TSCONFIG_PATHS,
      vitest: V15_2_0_VITEST,
    };
  }
};
