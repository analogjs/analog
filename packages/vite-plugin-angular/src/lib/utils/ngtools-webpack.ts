import { createRequire } from 'module';

const isCommonJS = typeof __filename !== 'undefined';
const requireFn = isCommonJS ? require : createRequire(import.meta.url);

export function getIvyTransformation() {
  // Temporary deep import for transformer support
  const { mergeTransformers, replaceBootstrap } = requireFn(
    '@ngtools/webpack/src/ivy/transformation'
  );
  return { mergeTransformers, replaceBootstrap };
}

export function getIvyHost() {
  const { augmentProgramWithVersioning, augmentHostWithCaching } = requireFn(
    '@ngtools/webpack/src/ivy/host'
  );
  return { augmentProgramWithVersioning, augmentHostWithCaching };
}
