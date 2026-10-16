import { lt } from 'semver';
import { stripIndents } from '@nx/devkit';
import {
  V19_X_ANALOG_JS_CONTENT,
  V19_X_ANALOG_JS_ROUTER,
  V19_X_MARKED,
  V19_X_MARKED_GFM_HEADING_ID,
  V19_X_MARKED_HIGHLIGHT,
  V19_X_MARKED_MANGLE,
  V19_X_PRISMJS,
} from './ng_19_X/versions';

const dependencyKeys = [
  '@analogjs/content',
  '@analogjs/router',
  'marked',
  'marked-gfm-heading-id',
  'marked-highlight',
  'prismjs',
] as const;
export type AnalogDependency = (typeof dependencyKeys)[number];

export const getAnalogDependencies = (
  ngVersion: string,
): Record<AnalogDependency, string> => {
  const escapedNgVersion = ngVersion.replace(/[~^]/, '');

  const dependencies = getDependencies(escapedNgVersion);

  return { ...dependencies };
};

const getDependencies = (escapedAngularVersion: string) => {
  // fail out for versions <20.0.0
  if (lt(escapedAngularVersion, '20.0.0')) {
    throw new Error(stripIndents`Angular v20.0.0 or newer is required.`);
  }

  // return latest deps for versions >=20.0.0
  return {
    '@analogjs/content': V19_X_ANALOG_JS_CONTENT,
    '@analogjs/router': V19_X_ANALOG_JS_ROUTER,
    marked: V19_X_MARKED,
    'marked-gfm-heading-id': V19_X_MARKED_GFM_HEADING_ID,
    'marked-highlight': V19_X_MARKED_HIGHLIGHT,
    'marked-mangle': V19_X_MARKED_MANGLE,
    prismjs: V19_X_PRISMJS,
  };
};
