import { lt } from 'semver';
import {
  V16_X_ANALOG_JS_CONTENT,
  V16_X_ANALOG_JS_ROUTER,
  V16_X_FRONT_MATTER,
  V16_X_MARKED,
  V16_X_MARKED_GFM_HEADING_ID,
  V16_X_MARKED_HIGHLIGHT,
  V16_X_PRISMJS,
} from './nx_16_X/versions';
import {
  V15_X_ANALOG_JS_CONTENT,
  V15_X_ANALOG_JS_ROUTER,
  V15_X_FRONT_MATTER,
  V15_X_MARKED,
  V15_X_PRISMJS,
} from './nx_15_X/versions';
import { stripIndents } from '@nx/devkit';

const dependencyKeys15 = [
  '@analogjs/content',
  '@analogjs/router',
  '@angular/platform-server',
  'front-matter',
  'marked',
  'prismjs',
] as const;

const dependencyKeys16 = ['marked-gfm-heading-id', 'marked-highlight'] as const;

export type AnalogDependency15 = (typeof dependencyKeys15)[number];
export type AnalogDependency16 = (typeof dependencyKeys16)[number];

type AnalogDependency15Record = Record<AnalogDependency15, string>;
type AnalogDependency16Record = Partial<Record<AnalogDependency16, string>>;

export type ExtendedDependenciesRecord = AnalogDependency15Record &
  AnalogDependency16Record;

export const getAnalogDependencies = (
  nxVersion: string,
  angularVersion: string
): ExtendedDependenciesRecord => {
  const escapedNxVersion = nxVersion.replace(/[~^]/, '');

  // fail out for versions <15.2.0
  if (lt(escapedNxVersion, '15.2.0')) {
    throw new Error(
      stripIndents`Nx v15.2.0 or newer is required to install Analog`
    );
  }

  // install 15.X deps for versions 15.8.0 =< 16.1.0
  if (lt(escapedNxVersion, '16.1.0')) {
    return {
      '@angular/platform-server': angularVersion,
      '@analogjs/content': V15_X_ANALOG_JS_CONTENT,
      '@analogjs/router': V15_X_ANALOG_JS_ROUTER,
      'front-matter': V15_X_FRONT_MATTER,
      marked: V15_X_MARKED,
      prismjs: V15_X_PRISMJS,
    };
  }

  // return latest 16.X deps for versions >= 16.1.0
  return {
    '@angular/platform-server': angularVersion,
    '@analogjs/content': V16_X_ANALOG_JS_CONTENT,
    '@analogjs/router': V16_X_ANALOG_JS_ROUTER,
    'front-matter': V16_X_FRONT_MATTER,
    marked: V16_X_MARKED,
    'marked-gfm-heading-id': V16_X_MARKED_GFM_HEADING_ID,
    'marked-highlight': V16_X_MARKED_HIGHLIGHT,
    prismjs: V16_X_PRISMJS,
  };
};
