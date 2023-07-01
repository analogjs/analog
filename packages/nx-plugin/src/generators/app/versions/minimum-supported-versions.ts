import { lt, coerce } from 'semver';
export const MINIMUM_SUPPORTED_NX_TRPC_VERSION = '16.1.0';
export const MINIMUM_SUPPORTED_NX_VERSION = '15.2.0';
export const MINIMUM_SUPPORTED_ANGULAR_VERSION = '15.0.0';
export const belowMinimumSupportedNxVersion = (nxVersion: string) =>
  lt(coerce(nxVersion), MINIMUM_SUPPORTED_NX_VERSION);
export const belowMinimumSupportedNxtRPCVersion = (nxVersion: string) =>
  lt(coerce(nxVersion), MINIMUM_SUPPORTED_NX_TRPC_VERSION);
export const belowMinimumSupportedAngularVersion = (angularVersion: string) =>
  lt(coerce(angularVersion), MINIMUM_SUPPORTED_ANGULAR_VERSION);
