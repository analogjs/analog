export async function getBuildApplicationFunction() {
  const { VERSION } = await (Function(
    'return import("@angular/compiler-cli")'
  )() as Promise<{ VERSION: { major: string; minor: string } }>);

  const angularVersion = Number(VERSION.major);
  const angularMinor = Number(VERSION.minor);
  let buildApplicationInternal: Function;

  if (angularVersion < 16 || (angularVersion === 16 && angularMinor <= 2)) {
    throw new Error(
      'This builder is not supported with versions earlier than Angular v16.2'
    );
  } else if (angularVersion >= 16 && angularVersion < 18) {
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
