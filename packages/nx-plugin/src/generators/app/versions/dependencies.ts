import { gt } from 'semver';
import {
  V_LATEST_ANALOG_JS_CONTENT,
  V_LATEST_ANALOG_JS_ROUTER,
  V_LATEST_FRONT_MATTER,
  V_LATEST_MARKED,
  V_LATEST_PRISMJS,
} from './latest/versions';
import {
  V16_1_0_ANALOG_JS_CONTENT,
  V16_1_0_ANALOG_JS_ROUTER,
  V16_1_0_FRONT_MATTER,
  V16_1_0_MARKED,
  V16_1_0_PRISMJS,
} from './nx_16_1_0/versions';
import {
  V15_8_0_ANALOG_JS_CONTENT,
  V15_8_0_ANALOG_JS_ROUTER,
  V15_8_0_FRONT_MATTER,
  V15_8_0_MARKED,
  V15_8_0_PRISMJS,
} from './nx_15_8_0/versions';
import {
  V15_2_0_ANALOG_JS_CONTENT,
  V15_2_0_ANALOG_JS_ROUTER,
  V15_2_0_FRONT_MATTER,
  V15_2_0_MARKED,
  V15_2_0_PRISMJS,
} from './nx_15_2_0/versions';

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

  if (gt(escapedNxVersion, '16.1.0')) {
    return {
      '@angular/platform-server': angularVersion,
      '@analogjs/content': V_LATEST_ANALOG_JS_CONTENT,
      '@analogjs/router': V_LATEST_ANALOG_JS_ROUTER,
      'front-matter': V_LATEST_FRONT_MATTER,
      marked: V_LATEST_MARKED,
      prismjs: V_LATEST_PRISMJS,
    };
  }
  if (gt(escapedNxVersion, '15.8.0')) {
    return {
      '@angular/platform-server': angularVersion,
      '@analogjs/content': V16_1_0_ANALOG_JS_CONTENT,
      '@analogjs/router': V16_1_0_ANALOG_JS_ROUTER,
      'front-matter': V16_1_0_FRONT_MATTER,
      marked: V16_1_0_MARKED,
      prismjs: V16_1_0_PRISMJS,
    };
  }
  if (gt(escapedNxVersion, '15.2.0')) {
    return {
      '@angular/platform-server': angularVersion,
      '@analogjs/content': V15_8_0_ANALOG_JS_CONTENT,
      '@analogjs/router': V15_8_0_ANALOG_JS_ROUTER,
      'front-matter': V15_8_0_FRONT_MATTER,
      marked: V15_8_0_MARKED,
      prismjs: V15_8_0_PRISMJS,
    };
  }
  if (gt(escapedNxVersion, '15.0.0')) {
    return {
      '@angular/platform-server': angularVersion,
      '@analogjs/content': V15_2_0_ANALOG_JS_CONTENT,
      '@analogjs/router': V15_2_0_ANALOG_JS_ROUTER,
      'front-matter': V15_2_0_FRONT_MATTER,
      marked: V15_2_0_MARKED,
      prismjs: V15_2_0_PRISMJS,
    };
  }
};
