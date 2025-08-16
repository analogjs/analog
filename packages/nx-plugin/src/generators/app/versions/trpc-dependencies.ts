import { lt, clean } from 'semver';
import { stripIndents } from '@nx/devkit';
import {
  V17_X_ANALOG_JS_TRPC,
  V17_X_TRPC_CLIENT,
  V17_X_TRPC_SERVER,
  V17_X_SUPERJSON,
  V17_X_ISOMORPHIC_FETCH,
  V17_X_ZOD,
} from './nx_17_X/versions';
import {
  V18_X_ANALOG_JS_TRPC,
  V18_X_TRPC_CLIENT,
  V18_X_TRPC_SERVER,
  V18_X_SUPERJSON,
  V18_X_ISOMORPHIC_FETCH,
  V18_X_ZOD,
} from './nx_18_X/versions';

const tRPCDependencyKeys = [
  '@analogjs/trpc',
  '@trpc/client',
  '@trpc/server',
  'superjson',
  'isomorphic-fetch',
  'zod',
] as const;
export type TrpcDependency = (typeof tRPCDependencyKeys)[number];

export const getTrpcDependencies = (
  nxVersion: string,
): Record<TrpcDependency, string> => {
  const escapedNxVersion = clean(nxVersion);

  if (!escapedNxVersion) {
    throw new Error(`Invalid Nx version: ${nxVersion}`);
  }

  // fail out for versions <17.0.0
  if (lt(escapedNxVersion, '17.0.0')) {
    throw new Error(
      stripIndents`Nx 17.0.0 or newer is required to install Analog`,
    );
  }

  // install 17.x deps for versions <18.0.0
  if (lt(escapedNxVersion, '18.0.0')) {
    return {
      '@analogjs/trpc': V17_X_ANALOG_JS_TRPC,
      '@trpc/client': V17_X_TRPC_CLIENT,
      '@trpc/server': V17_X_TRPC_SERVER,
      superjson: V17_X_SUPERJSON,
      'isomorphic-fetch': V17_X_ISOMORPHIC_FETCH,
      zod: V17_X_ZOD,
    };
  }

  // return latest deps for versions >= 18.0.0
  return {
    '@analogjs/trpc': V18_X_ANALOG_JS_TRPC,
    '@trpc/client': V18_X_TRPC_CLIENT,
    '@trpc/server': V18_X_TRPC_SERVER,
    superjson: V18_X_SUPERJSON,
    'isomorphic-fetch': V18_X_ISOMORPHIC_FETCH,
    zod: V18_X_ZOD,
  };
};
