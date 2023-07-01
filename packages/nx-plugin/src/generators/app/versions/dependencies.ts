import { lt } from 'semver';
import {
  V16_X_ANALOG_JS_CONTENT,
  V16_X_ANALOG_JS_ROUTER,
  V16_X_FRONT_MATTER,
  V16_X_MARKED,
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

const dependencyKeys = [
  '@analogjs/content',
  '@analogjs/router',
  '@angular/platform-server',
  'front-matter',
  'marked',
  'prismjs',
] as const;
export type AnalogDependency = (typeof dependencyKeys)[number];

export const getAnalogDependencies = (
  nxVersion: string,
  angularVersion: string
): Record<AnalogDependency, string> => {
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
    prismjs: V16_X_PRISMJS,
  };
};
