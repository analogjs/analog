import { lt } from 'semver';
import {
  V16_X_ANALOG_JS_CONTENT,
  V16_X_ANALOG_JS_ROUTER,
  V16_X_FRONT_MATTER,
  V16_X_MARKED,
  V16_X_MARKED_GFM_HEADING_ID,
  V16_X_MARKED_HIGHLIGHT,
  V16_X_MARKED_MANGLE,
  V16_X_MERMAID,
  V16_X_PRISMJS,
} from './nx_16_X/versions';
import {
  V15_X_ANALOG_JS_CONTENT,
  V15_X_ANALOG_JS_ROUTER,
  V15_X_FRONT_MATTER,
  V15_X_MARKED,
  V15_X_MERMAID,
  V15_X_PRISMJS,
} from './nx_15_X/versions';
import { stripIndents } from '@nx/devkit';
import {
  V17_X_ANALOG_JS_CONTENT,
  V17_X_ANALOG_JS_ROUTER,
  V17_X_FRONT_MATTER,
  V17_X_MARKED,
  V17_X_MARKED_GFM_HEADING_ID,
  V17_X_MARKED_HIGHLIGHT,
  V17_X_MARKED_MANGLE,
  V17_X_MERMAID,
  V17_X_PRISMJS,
} from './nx_17_X/versions';
import {
  V18_X_ANALOG_JS_CONTENT,
  V18_X_ANALOG_JS_ROUTER,
  V18_X_FRONT_MATTER,
  V18_X_MARKED,
  V18_X_MARKED_GFM_HEADING_ID,
  V18_X_MARKED_HIGHLIGHT,
  V18_X_MARKED_MANGLE,
  V18_X_MERMAID,
  V18_X_PRISMJS,
} from './nx_18_X/versions';

const dependencyKeys15 = [
  '@analogjs/content',
  '@analogjs/router',
  '@angular/platform-server',
  'front-matter',
  'marked',
  'mermaid',
  'prismjs',
] as const;

const dependencyKeys16 = [
  'marked-gfm-heading-id',
  'marked-highlight',
  'marked-mangle',
  'mermaid',
] as const;

export type AnalogDependency15 = (typeof dependencyKeys15)[number];
export type AnalogDependency16 = (typeof dependencyKeys16)[number];

type AnalogDependency15Record = Record<AnalogDependency15, string>;
type AnalogDependency16Record = Partial<Record<AnalogDependency16, string>>;

export type ExtendedDependenciesRecord = AnalogDependency15Record &
  AnalogDependency16Record;

export const getAnalogDependencies = (
  nxVersion: string,
  angularVersion: string,
): ExtendedDependenciesRecord => {
  const escapedNxVersion = nxVersion.replace(/[~^]/, '');

  // fail out for versions <15.2.0
  if (lt(escapedNxVersion, '15.2.0')) {
    throw new Error(
      stripIndents`Nx v15.2.0 or newer is required to install Analog`,
    );
  }

  // install 15.X deps for versions 15.8.0 =< 16.1.0
  if (lt(escapedNxVersion, '16.1.0')) {
    return {
      '@angular/platform-server': `^${angularVersion}`,
      '@analogjs/content': V15_X_ANALOG_JS_CONTENT,
      '@analogjs/router': V15_X_ANALOG_JS_ROUTER,
      'front-matter': V15_X_FRONT_MATTER,
      marked: V15_X_MARKED,
      mermaid: V15_X_MERMAID,
      prismjs: V15_X_PRISMJS,
    };
  }

  // install 16.X deps for versions 16.1.0 =< 16.10.0
  if (lt(escapedNxVersion, '17.0.0')) {
    return {
      '@angular/platform-server': `^${angularVersion}`,
      '@analogjs/content': V16_X_ANALOG_JS_CONTENT,
      '@analogjs/router': V16_X_ANALOG_JS_ROUTER,
      'front-matter': V16_X_FRONT_MATTER,
      marked: V16_X_MARKED,
      'marked-gfm-heading-id': V16_X_MARKED_GFM_HEADING_ID,
      'marked-highlight': V16_X_MARKED_HIGHLIGHT,
      'marked-mangle': V16_X_MARKED_MANGLE,
      mermaid: V16_X_MERMAID,
      prismjs: V16_X_PRISMJS,
    };
  }

  // install 17.X deps for versions <18.0.0
  if (lt(escapedNxVersion, '18.0.0')) {
    return {
      '@angular/platform-server': `^${angularVersion}`,
      '@analogjs/content': V17_X_ANALOG_JS_CONTENT,
      '@analogjs/router': V17_X_ANALOG_JS_ROUTER,
      'front-matter': V17_X_FRONT_MATTER,
      marked: V17_X_MARKED,
      'marked-gfm-heading-id': V17_X_MARKED_GFM_HEADING_ID,
      'marked-highlight': V17_X_MARKED_HIGHLIGHT,
      'marked-mangle': V17_X_MARKED_MANGLE,
      mermaid: V17_X_MERMAID,
      prismjs: V17_X_PRISMJS,
    };
  }

  // return latest 18.X deps for versions >= 18.0.0
  return {
    '@angular/platform-server': `^${angularVersion}`,
    '@analogjs/content': V18_X_ANALOG_JS_CONTENT,
    '@analogjs/router': V18_X_ANALOG_JS_ROUTER,
    'front-matter': V18_X_FRONT_MATTER,
    marked: V18_X_MARKED,
    'marked-gfm-heading-id': V18_X_MARKED_GFM_HEADING_ID,
    'marked-highlight': V18_X_MARKED_HIGHLIGHT,
    'marked-mangle': V18_X_MARKED_MANGLE,
    mermaid: V18_X_MERMAID,
    prismjs: V18_X_PRISMJS,
  };
};
