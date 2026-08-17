/**
 * Fixture for the analog.plugins escape hatch: an app-supplied esbuild
 * plugin serving a virtual module, loaded through the builder config.
 */
export default {
  name: 'build-info',
  setup(build) {
    build.onResolve({ filter: /^virtual:build-info$/ }, (args) => ({
      path: args.path,
      namespace: 'build-info',
    }));
    build.onLoad({ filter: /./, namespace: 'build-info' }, () => ({
      contents: `export const builtBy = 'custom-esbuild-plugin';`,
      loader: 'js',
    }));
  },
};
