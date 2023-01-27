import { Plugin } from 'vite';
import * as fs from 'fs';
import * as path from 'path';

/**
 * This excludes the build from including the
 * @analogjs/content package because it is
 * dynamically imported at runtime.
 *
 * This prevents a dependency on @analogjs/router
 * to @analogjs/content
 *
 * @returns
 */
export function contentPlugin(): Plugin[] {
  let excludeContent = true;

  const pkgJsonPath = path.resolve(process.cwd(), './package.json');
  const packageJsonExists = fs.existsSync(pkgJsonPath);

  if (packageJsonExists) {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));

    if (pkg.dependencies['@analogjs/content']) {
      excludeContent = false;
    }
  }

  return [
    {
      name: 'analogjs-content-build-plugin',
      config() {
        return {
          optimizeDeps: {
            include: excludeContent ? [] : ['@analogjs/content'],
          },
          build: {
            rollupOptions: {
              external: excludeContent ? ['@analogjs/content'] : [],
            },
          },
        };
      },
    },
    {
      name: 'analogjs-content-frontmatter',
      async transform(_code, id) {
        // Transform only the frontmatter into a JSON object for lists
        if (id.includes('.md?analog-content-list')) {
          const fm: any = await import('front-matter');
          const fileContents = fs.readFileSync(id.split('?')[0], 'utf8');
          const frontmatter = fm(fileContents).attributes;

          return `export default ${JSON.stringify(frontmatter)}`;
        }

        return;
      },
    },
  ];
}
