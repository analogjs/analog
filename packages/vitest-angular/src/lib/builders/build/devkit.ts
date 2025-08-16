export async function getBuildApplicationFunction() {
  const { VERSION } = await (Function(
    'return import("@angular/compiler-cli")',
  )() as Promise<{ VERSION: { major: string; minor: string } }>);

  const angularVersion = Number(VERSION.major);
  let buildApplicationInternal: Function;

  if (angularVersion < 17) {
    throw new Error(
      'This builder is not supported with versions earlier than Angular v17',
    );
  } else if (angularVersion >= 17 && angularVersion < 18) {
    const {
      buildApplicationInternal: buildApplicationInternalFn,
    } = require('@angular-devkit/build-angular/src/builders/application');

    buildApplicationInternal = buildApplicationInternalFn;
  } else {
    const {
      buildApplicationInternal: buildApplicationInternalFn,
    } = require('@angular/build/private');

    buildApplicationInternal = buildApplicationInternalFn;
  }

  return { buildApplicationInternal, angularVersion };
}
