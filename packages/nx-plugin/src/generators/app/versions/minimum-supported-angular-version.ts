import { lt, clean, coerce } from 'semver';
export const MINIMUM_SUPPORTED_ANGULAR_VERSION = '15.0.0';
export const hasMinimumSupportedAngularVersion = (angularVersion: string) =>
  lt(coerce(angularVersion), MINIMUM_SUPPORTED_ANGULAR_VERSION);
