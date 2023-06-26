import { lt, major } from 'semver';
import {
  addDependenciesToPackageJson,
  ensurePackage,
  stripIndents,
  Tree,
} from '@nx/devkit';
import {
  MINIMUM_SUPPORTED_ANGULAR_VERSION,
  V15_ANGULAR,
  V15_NRWL_ANGULAR,
  V15_NRWL_DEVKIT,
  V16_ANGULAR,
  V16_NX_ANGULAR,
  V16_NX_DEVKIT,
} from '../versions';
import { getInstalledPackageVersion } from '../../../utils/version-utils';
import { NormalizedOptions } from '../generator';

export async function initializeAngularWorkspace(
  tree: Tree,
  installedNxVersion: string,
  normalizedOptions: NormalizedOptions
) {
  let angularVersion = getInstalledPackageVersion(tree, '@angular/core');

  if (!angularVersion) {
    console.log(
      'Angular has not been installed yet. Creating an Angular application'
    );

    if (major(installedNxVersion) >= 16) {
      try {
        ensurePackage('@nx/devkit', V16_NX_DEVKIT);
        ensurePackage('@nx/angular', V16_NX_ANGULAR);
      } catch {
        // @nx/angular cannot be required so this fails but this will still allow executing the nx angular init later on
      }
      addDependenciesToPackageJson(
        tree,
        {},
        {
          '@nx/devkit': V16_NX_DEVKIT,
          '@nx/angular': V16_NX_ANGULAR,
        }
      );
    } else {
      try {
        ensurePackage('@nrwl/devkit', V15_NRWL_DEVKIT);
        ensurePackage('@nrwl/angular', V15_NRWL_ANGULAR);
      } catch {
        // @nx/angular cannot be required so this fails but this will still allow executing the nx angular init later on
      }
      addDependenciesToPackageJson(
        tree,
        {},
        {
          '@nrwl/devkit': V15_NRWL_DEVKIT,
          '@nrwl/angular': V15_NRWL_ANGULAR,
        }
      );
    }

    if (major(installedNxVersion) >= 16) {
      await (
        await import(
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          '@nx/angular/generators'
        )
      ).angularInitGenerator(tree, {
        unitTestRunner: 'none' as any,
        skipInstall: true,
        skipFormat: normalizedOptions.skipFormat,
      });
      angularVersion = V16_ANGULAR;
    } else {
      await (
        await import('@nx/angular/generators')
      ).angularInitGenerator(tree, {
        unitTestRunner: 'none' as any,
        skipInstall: true,
        skipFormat: normalizedOptions.skipFormat,
      });
      angularVersion = V15_ANGULAR;
    }
  }

  if (lt(angularVersion, MINIMUM_SUPPORTED_ANGULAR_VERSION)) {
    throw new Error(
      stripIndents`Analog only supports an Angular version of 15 and higher`
    );
  }

  return angularVersion;
}
