import { lt, coerce } from 'semver';
export const MINIMUM_SUPPORTED_NX_TRPC_VERSION = '16.1.0';
export const MINIMUM_SUPPORTED_NX_VERSION = '15.2.0';
export const MINIMUM_SUPPORTED_ANGULAR_VERSION = '15.0.0';
export const belowMinimumSupportedNxVersion = (nxVersion: string) => {
  const version = coerce(nxVersion);
  return version ? lt(version, MINIMUM_SUPPORTED_NX_VERSION) : true;
};
export const belowMinimumSupportedNxtRPCVersion = (nxVersion: string) => {
  const version = coerce(nxVersion);
  return version ? lt(version, MINIMUM_SUPPORTED_NX_TRPC_VERSION) : true;
};
export const belowMinimumSupportedAngularVersion = (angularVersion: string) => {
  const version = coerce(angularVersion);
  return version ? lt(version, MINIMUM_SUPPORTED_ANGULAR_VERSION) : true;
};
