import { lt } from 'semver';
import {
  V16_X_ANALOG_JS_CONTENT,
  V16_X_ANALOG_JS_ROUTER,
  V16_X_MARKED,
  V16_X_MARKED_GFM_HEADING_ID,
  V16_X_MARKED_HIGHLIGHT,
  V16_X_MARKED_MANGLE,
  V16_X_NX_ANGULAR,
  V16_X_PRISMJS,
} from './ng_16_X/versions';
import { stripIndents } from '@nx/devkit';
import {
  V17_X_ANALOG_JS_CONTENT,
  V17_X_ANALOG_JS_ROUTER,
  V17_X_MARKED,
  V17_X_MARKED_GFM_HEADING_ID,
  V17_X_MARKED_HIGHLIGHT,
  V17_X_MARKED_MANGLE,
  V17_X_NX_ANGULAR,
  V17_X_PRISMJS,
} from './ng_17_X/versions';
import {
  V15_X_ANALOG_JS_CONTENT,
  V15_X_ANALOG_JS_ROUTER,
  V15_X_MARKED,
  V15_X_MARKED_GFM_HEADING_ID,
  V15_X_MARKED_HIGHLIGHT,
  V15_X_MARKED_MANGLE,
  V15_X_NX_ANGULAR,
  V15_X_PRISMJS,
} from './ng_15_X/versions';
import {
  V18_X_ANALOG_JS_CONTENT,
  V18_X_ANALOG_JS_ROUTER,
  V18_X_MARKED,
  V18_X_MARKED_GFM_HEADING_ID,
  V18_X_MARKED_HIGHLIGHT,
  V18_X_MARKED_MANGLE,
  V18_X_NX_ANGULAR,
  V18_X_PRISMJS,
} from './ng_18_X/versions';

const dependencyKeys = [
  '@analogjs/content',
  '@analogjs/router',
  '@nx/angular',
  'marked',
  'marked-gfm-heading-id',
  'marked-highlight',
  'prismjs',
] as const;
export type AnalogDependency = (typeof dependencyKeys)[number];

export const getAnalogDependencies = (
  ngVersion: string
): Record<AnalogDependency, string> => {
  const escapedNgVersion = ngVersion.replace(/[~^]/, '');

  const dependencies = getDependencies(escapedNgVersion);

  return { ...dependencies };
};

const getDependencies = (escapedAngularVersion: string) => {
  // fail out for versions <15.2.0
  if (lt(escapedAngularVersion, '15.0.0')) {
    throw new Error(stripIndents`Angular v15.0.0 or newer is required.`);
  }

  // install 15.x deps for versions <16.0.0
  if (lt(escapedAngularVersion, '16.0.0')) {
    return {
      '@analogjs/content': V15_X_ANALOG_JS_CONTENT,
      '@analogjs/router': V15_X_ANALOG_JS_ROUTER,
      '@nx/angular': V15_X_NX_ANGULAR,
      marked: V15_X_MARKED,
      'marked-gfm-heading-id': V15_X_MARKED_GFM_HEADING_ID,
      'marked-highlight': V15_X_MARKED_HIGHLIGHT,
      'marked-mangle': V15_X_MARKED_MANGLE,
      prismjs: V15_X_PRISMJS,
    };
  }

  // install 16.x deps for versions <17.0.0
  if (lt(escapedAngularVersion, '17.0.0')) {
    return {
      '@analogjs/content': V16_X_ANALOG_JS_CONTENT,
      '@analogjs/router': V16_X_ANALOG_JS_ROUTER,
      '@nx/angular': V16_X_NX_ANGULAR,
      marked: V16_X_MARKED,
      'marked-gfm-heading-id': V16_X_MARKED_GFM_HEADING_ID,
      'marked-highlight': V16_X_MARKED_HIGHLIGHT,
      'marked-mangle': V16_X_MARKED_MANGLE,
      prismjs: V16_X_PRISMJS,
    };
  }

  // install 17.x deps for versions <18.0.0
  if (lt(escapedAngularVersion, '18.0.0')) {
    return {
      '@analogjs/content': V17_X_ANALOG_JS_CONTENT,
      '@analogjs/router': V17_X_ANALOG_JS_ROUTER,
      '@nx/angular': V17_X_NX_ANGULAR,
      marked: V17_X_MARKED,
      'marked-gfm-heading-id': V17_X_MARKED_GFM_HEADING_ID,
      'marked-highlight': V17_X_MARKED_HIGHLIGHT,
      'marked-mangle': V17_X_MARKED_MANGLE,
      prismjs: V17_X_PRISMJS,
    };
  }

  // return latest 18.x deps for versions >18.0.0
  return {
    '@analogjs/content': V18_X_ANALOG_JS_CONTENT,
    '@analogjs/router': V18_X_ANALOG_JS_ROUTER,
    '@nx/angular': V18_X_NX_ANGULAR,
    marked: V18_X_MARKED,
    'marked-gfm-heading-id': V18_X_MARKED_GFM_HEADING_ID,
    'marked-highlight': V18_X_MARKED_HIGHLIGHT,
    'marked-mangle': V18_X_MARKED_MANGLE,
    prismjs: V18_X_PRISMJS,
  };
};
