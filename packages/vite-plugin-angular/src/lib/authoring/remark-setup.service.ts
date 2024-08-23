import { unified, type Processor } from 'unified';
import { type Plugin } from 'unified';
import { Literal } from 'unist';
import { visit } from 'unist-util-visit';
import rehypeStringify from 'rehype-stringify';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { UnifiedPlugins } from './markdown-transform';

const rehypeAnalog: Plugin = () => {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if ((node as any).tagName === 'p') {
        visit(node, 'text', (childNode) => {
          const literal = childNode as Literal;
          if (detectAngularControlFlow(literal.value as string)) {
            literal.type = 'raw';
          } else {
            literal.value = escapeBreakingCharacters(literal.value as string);
          }
        });
      }

      if ((node as any).tagName === 'code') {
        visit(node, 'text', (childNode) => {
          const literal = childNode as Literal;
          literal.value = escapeBreakingCharacters(literal.value as string);
        });
      }
    });
  };
};

function escapeBreakingCharacters(code: string) {
  // Escape commonly used HTML characters
  // in Angular templates that cause template parse errors
  // such as @, {, and ,}.
  code = code.replace(/@/g, '&#64;');
  code = code.replace(/{/g, '&#x2774;').replace(/}/g, '&#x2775;');
  return code;
}

function detectAngularControlFlow(text: string) {
  return (
    (text.trim().startsWith('@if') ||
      text.trim().startsWith('@for') ||
      text.trim().startsWith('@switch') ||
      text.trim().startsWith('@defer')) &&
    text.trim().endsWith('}')
  );
}

const applyPlugins = (plugins: UnifiedPlugins, parser: Processor) => {
  (plugins as UnifiedPlugins).forEach((plugin) => {
    if (Array.isArray(plugin)) {
      if (plugin[1] && plugin[1]) parser.use(plugin[0], plugin[1]);
      else parser.use(plugin[0]);
    } else {
      parser.use(plugin);
    }
  });

  return parser;
};

export class RemarkSetupService {
  constructor() {
    // TODO:
    const remarkPlugins: any = [];
    const rehypePlugins: any = [];

    const toMDAST = unified().use(remarkParse);
    applyPlugins(remarkPlugins, toMDAST);
    const toHAST = toMDAST.use(remarkRehype, { allowDangerousHtml: true });
    applyPlugins(rehypePlugins, toHAST);

    const processor = toHAST
      .use(rehypeStringify, {
        allowDangerousHtml: true,
      })
      .use(rehypeAnalog);
  }
  // private readonly remark = unified()
  //   .use(remarkParse)
  //   // TODO: add remark plugins here
  //   .use(remarkRehype, { allowDangerousHtml: true })
  //   // TODO: add rehype plugins here
  //   .use(rehypeStringify, {
  //     allowDangerousHtml: true,
  //   })
  //   .use(rehypeAnalog);
  //
  // getRemarkInstance() {
  //   return this.remark;
  // }
}
