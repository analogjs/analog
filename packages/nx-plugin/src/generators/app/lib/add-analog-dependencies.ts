import { addDependenciesToPackageJson, Tree } from '@nrwl/devkit';
import {
  V15_ANALOG_JS_CONTENT,
  V15_ANALOG_JS_PLATFORM,
  V15_ANALOG_JS_ROUTER,
  V15_ANGULAR_PLATFORM_SERVER,
  V15_FRONT_MATTER,
  V15_JSDOM,
  V15_MARKED,
  V15_NRWL_VITE,
  V15_PRISMJS,
  V15_TYPESCRIPT,
  V15_VITE,
  V15_VITE_TSCONFIG_PATHS,
  V15_VITEST,
  V16_ANALOG_JS_CONTENT,
  V16_ANALOG_JS_PLATFORM,
  V16_ANALOG_JS_ROUTER,
  V16_ANGULAR_PLATFORM_SERVER,
  V16_FRONT_MATTER,
  V16_JSDOM,
  V16_MARKED,
  V16_NX_VITE,
  V16_PRISMJS,
  V16_TYPESCRIPT,
  V16_VITE,
  V16_VITE_TSCONFIG_PATHS,
  V16_VITEST,
} from '../versions';

export async function addAnalogDependencies(
  tree: Tree,
  majorAngularVersion: number,
  majorNxVersion: number
) {
  const dependencies = {
    '@analogjs/content':
      majorAngularVersion === 15
        ? V15_ANALOG_JS_CONTENT
        : V16_ANALOG_JS_CONTENT,
    '@analogjs/router':
      majorAngularVersion === 15 ? V15_ANALOG_JS_ROUTER : V16_ANALOG_JS_ROUTER,
    '@angular/platform-server':
      majorAngularVersion === 15
        ? V15_ANGULAR_PLATFORM_SERVER
        : V16_ANGULAR_PLATFORM_SERVER,
    'front-matter':
      majorAngularVersion === 15 ? V15_FRONT_MATTER : V16_FRONT_MATTER,
    marked: majorAngularVersion === 15 ? V15_MARKED : V16_MARKED,
    prismjs: majorAngularVersion === 15 ? V15_PRISMJS : V16_PRISMJS,
  };

  const nxViteDependency =
    majorNxVersion === 15
      ? {
          '@nrwl/vite':
            majorAngularVersion === 15 ? V15_NRWL_VITE : V16_NX_VITE,
        }
      : {
          '@nx/vite': majorAngularVersion === 15 ? V15_NRWL_VITE : V16_NX_VITE,
        };
  const devDependencies = {
    '@analogjs/platform':
      majorAngularVersion === 15
        ? V15_ANALOG_JS_PLATFORM
        : V16_ANALOG_JS_PLATFORM,
    ...nxViteDependency,
    jsdom: majorAngularVersion === 15 ? V15_JSDOM : V16_JSDOM,
    typescript: majorAngularVersion === 15 ? V15_TYPESCRIPT : V16_TYPESCRIPT,
    vite: majorAngularVersion === 15 ? V15_VITE : V16_VITE,
    'vite-tsconfig-paths':
      majorAngularVersion === 15
        ? V15_VITE_TSCONFIG_PATHS
        : V16_VITE_TSCONFIG_PATHS,
    vitest: majorAngularVersion === 15 ? V15_VITEST : V16_VITEST,
  };

  addDependenciesToPackageJson(tree, dependencies, devDependencies);
}
