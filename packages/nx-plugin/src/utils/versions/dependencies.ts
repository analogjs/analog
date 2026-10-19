import { lt } from 'semver';
import { stripIndents } from '@nx/devkit';
import {
  ANALOG_JS_CONTENT,
  ANALOG_JS_ROUTER,
  MARKED,
  MARKED_GFM_HEADING_ID,
  MARKED_HIGHLIGHT,
  MARKED_MANGLE,
  PRISMJS,
} from './versions';

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
    '@analogjs/content': ANALOG_JS_CONTENT,
    '@analogjs/router': ANALOG_JS_ROUTER,
    marked: MARKED,
    'marked-gfm-heading-id': MARKED_GFM_HEADING_ID,
    'marked-highlight': MARKED_HIGHLIGHT,
    'marked-mangle': MARKED_MANGLE,
    prismjs: PRISMJS,
  };
};
