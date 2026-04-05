import { Tree, SchematicsException } from '@angular-devkit/schematics';
import { coerce, major } from 'semver';

export function getAngularVersion(tree: Tree): string {
  const packageJson = tree.read('package.json');
  if (!packageJson) {
    throw new SchematicsException('Could not find package.json');
  }

  const pkg = JSON.parse(packageJson.toString('utf-8'));
  const angularVersion =
    pkg.dependencies?.['@angular/core'] ||
    pkg.devDependencies?.['@angular/core'];

  if (!angularVersion) {
    throw new SchematicsException(
      'Could not find @angular/core in package.json',
    );
  }

  return angularVersion;
}

export function getMajorAngularVersion(angularVersion: string): number {
  const coerced = coerce(angularVersion);
  if (!coerced) {
    throw new SchematicsException(
      `Could not parse Angular version: ${angularVersion}`,
    );
  }
  return major(coerced);
}
