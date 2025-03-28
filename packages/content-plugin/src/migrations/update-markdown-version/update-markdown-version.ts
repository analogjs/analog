import {
  addDependenciesToPackageJson,
  Tree,
  formatFiles,
  installPackagesTask,
} from '@nx/devkit';

export default async function update(host: Tree) {
  // NOTE: we only add the dependency if the project is an Angular project
  //  Nx projects can add the dependency from migrations.json
  let dependencyAdded = false;
  if (host.exists('/angular.json')) {
    addDependenciesToPackageJson(
      host,
      {
        marked: '^15.0.7',
        'marked-mangle': '^1.1.10',
        'marked-highlight': '^2.2.1',
        'marked-gfm-heading-id': '^4.1.1',
      },
      {},
    );
    dependencyAdded = true;
  }

  await formatFiles(host);

  if (dependencyAdded) {
    return () => installPackagesTask(host);
  }
}
