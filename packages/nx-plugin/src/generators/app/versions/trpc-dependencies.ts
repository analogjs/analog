import { gt, clean } from 'semver';
import {
  V_LATEST_ANALOG_JS_TRPC,
  V_LATEST_ISOMORPHIC_FETCH,
  V_LATEST_SUPERJSON,
  V_LATEST_TRPC_CLIENT,
  V_LATEST_TRPC_SERVER,
  V_LATEST_ZOD,
} from './latest/versions';
import {
  V16_1_0_ANALOG_JS_TRPC,
  V16_1_0_ISOMORPHIC_FETCH,
  V16_1_0_SUPERJSON,
  V16_1_0_TRPC_CLIENT,
  V16_1_0_TRPC_SERVER,
  V16_1_0_ZOD,
} from './nx_16_1_0/versions';
import {
  V15_8_0_ANALOG_JS_TRPC,
  V15_8_0_ISOMORPHIC_FETCH,
  V15_8_0_SUPERJSON,
  V15_8_0_TRPC_CLIENT,
  V15_8_0_TRPC_SERVER,
  V15_8_0_ZOD,
} from './nx_15_8_0/versions';
import {
  V15_2_0_ANALOG_JS_TRPC,
  V15_2_0_ISOMORPHIC_FETCH,
  V15_2_0_SUPERJSON,
  V15_2_0_TRPC_CLIENT,
  V15_2_0_TRPC_SERVER,
  V15_2_0_ZOD,
} from './nx_15_2_0/versions';

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
  nxVersion: string
): Record<TrpcDependency, string> => {
  const escapedNxVersion = clean(nxVersion);
  if (gt(escapedNxVersion, '16.1.0')) {
    return {
      '@analogjs/trpc': V_LATEST_ANALOG_JS_TRPC,
      '@trpc/client': V_LATEST_TRPC_CLIENT,
      '@trpc/server': V_LATEST_TRPC_SERVER,
      superjson: V_LATEST_SUPERJSON,
      'isomorphic-fetch': V_LATEST_ISOMORPHIC_FETCH,
      zod: V_LATEST_ZOD,
    };
  }

  if (gt(escapedNxVersion, '15.8.0')) {
    return {
      '@analogjs/trpc': V16_1_0_ANALOG_JS_TRPC,
      '@trpc/client': V16_1_0_TRPC_CLIENT,
      '@trpc/server': V16_1_0_TRPC_SERVER,
      superjson: V16_1_0_SUPERJSON,
      'isomorphic-fetch': V16_1_0_ISOMORPHIC_FETCH,
      zod: V16_1_0_ZOD,
    };
  }
  if (gt(escapedNxVersion, '15.2.0')) {
    return {
      '@analogjs/trpc': V15_8_0_ANALOG_JS_TRPC,
      '@trpc/client': V15_8_0_TRPC_CLIENT,
      '@trpc/server': V15_8_0_TRPC_SERVER,
      superjson: V15_8_0_SUPERJSON,
      'isomorphic-fetch': V15_8_0_ISOMORPHIC_FETCH,
      zod: V15_8_0_ZOD,
    };
  }
  if (gt(escapedNxVersion, '15.0.0')) {
    return {
      '@analogjs/trpc': V15_2_0_ANALOG_JS_TRPC,
      '@trpc/client': V15_2_0_TRPC_CLIENT,
      '@trpc/server': V15_2_0_TRPC_SERVER,
      superjson: V15_2_0_SUPERJSON,
      'isomorphic-fetch': V15_2_0_ISOMORPHIC_FETCH,
      zod: V15_2_0_ZOD,
    };
  }
};
