import { lt, coerce } from 'semver';

export const MINIMUM_SUPPORTED_NX_VERSION = '21.2.0';
export const MINIMUM_SUPPORTED_OXLINT_NX_VERSION = '23.2.0';
export const MINIMUM_SUPPORTED_ANGULAR_VERSION = '20.0.0';

export const belowMinimumSupportedNxVersion = (nxVersion: string): boolean =>
  lt(coerce(nxVersion)!, MINIMUM_SUPPORTED_NX_VERSION);

export const belowMinimumSupportedOxlintNxVersion = (
  nxVersion: string,
): boolean => lt(coerce(nxVersion)!, MINIMUM_SUPPORTED_OXLINT_NX_VERSION);
