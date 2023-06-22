import { Plugin } from 'vite';
import * as fs from 'fs';

export function contentPlugin(): Plugin[] {
  return [
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
