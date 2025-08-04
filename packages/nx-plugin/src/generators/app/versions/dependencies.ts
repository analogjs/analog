import { lt } from 'semver';
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

const dependencyKeys = [
  '@analogjs/content',
  '@analogjs/router',
  '@angular/platform-server',
  'front-matter',
  'marked',
  'marked-gfm-heading-id',
  'marked-highlight',
  'marked-mangle',
  'mermaid',
  'prismjs',
] as const;

export type AnalogDependency = (typeof dependencyKeys)[number];

export type ExtendedDependenciesRecord = Record<AnalogDependency, string>;

export const getAnalogDependencies = (
  nxVersion: string,
  angularVersion: string,
): ExtendedDependenciesRecord => {
  const escapedNxVersion = nxVersion.replace(/[~^]/, '');

  // fail out for versions <15.2.0
  if (lt(escapedNxVersion, '17.0.0')) {
    throw new Error(
      stripIndents`Nx v17.0.0 or newer is required to install Analog`,
    );
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
