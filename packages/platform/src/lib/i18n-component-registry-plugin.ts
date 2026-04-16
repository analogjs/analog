import type { Plugin, TransformResult } from 'vite';
import MagicString from 'magic-string';

/**
 * Vite plugin that instruments compiled Angular component definitions with
 * calls to `registerI18nComponentDef()` from `@analogjs/router`. This
 * populates a process-level registry of component definitions that the
 * server renderer uses to null cached `tView` objects between SSR requests,
 * allowing `$localize` tagged templates in `consts()` to re-evaluate with
 * the freshly loaded translations for each request's locale.
 *
 * The plugin runs in `enforce: 'post'` so that it sees the compiled
 * JavaScript output from the Angular compiler (which contains the
 * `ClassName.ɵcmp = ɵɵdefineComponent({...})` assignments).
 *
 * Only active when the platform's `i18n` option is configured.
 * Only transforms modules loaded for the SSR environment.
 */
export function i18nComponentRegistryPlugin(): Plugin {
  return {
    name: 'analogjs-i18n-component-registry',
    enforce: 'post',

    transform(code, id, options): TransformResult | undefined {
      if (!options?.ssr) return;
      if (!code.includes('.ɵcmp')) return;
      if (id.includes('node_modules')) return;
      if (!id.match(/\.(ts|js)(\?|$)/)) return;

      const ast = this.parse(code) as unknown as AstNode;
      const classNames = findComponentClassNames(ast);

      if (classNames.size === 0) return;

      const registrations = [...classNames]
        .map((name) => `__analog_i18n_reg(${name});`)
        .join('\n');

      // Use MagicString so the source map stays aligned with the original
      // file — prepended imports and appended registration calls must not
      // shift line numbers for frames that land inside the user's code.
      const s = new MagicString(code);
      s.prepend(
        `import { ɵregisterI18nComponentDef as __analog_i18n_reg } from '@analogjs/router';\n`,
      );
      s.append(`\n${registrations}\n`);

      return {
        code: s.toString(),
        map: s.generateMap({ hires: true, source: id, includeContent: true }),
      };
    },
  };
}

// Minimal ESTree node shape used by the walker.
interface AstNode {
  type: string;
  [key: string]: unknown;
}

/**
 * Walks the AST to find class names whose definitions include a `ɵcmp`
 * static property assignment — the marker Angular uses for compiled
 * component definitions.
 *
 * Handles two codegen styles:
 *
 * Production (tree-shaken):
 *   _ClassName.ɵcmp = ɵɵdefineComponent({...})
 *   → AssignmentExpression  left: MemberExpression(.ɵcmp)  object: Identifier
 *
 * Dev mode (class fields):
 *   class Foo { static { this.ɵcmp = i0.ɵɵdefineComponent({...}) } }
 *   → ClassDeclaration → StaticBlock → AssignmentExpression  left: MemberExpression(.ɵcmp) object: ThisExpression
 */
function findComponentClassNames(ast: AstNode): Set<string> {
  const names = new Set<string>();

  walk(ast, (node: any) => {
    // Prod: top-level `Identifier.ɵcmp = ...`
    if (
      node.type === 'AssignmentExpression' &&
      isNode(node.left) &&
      node.left.type === 'MemberExpression' &&
      isNode(node.left.property) &&
      (node.left.property as AstNode & { name?: string }).name === 'ɵcmp' &&
      isNode(node.left.object) &&
      node.left.object.type === 'Identifier'
    ) {
      const name = (node.left.object as AstNode & { name: string }).name;
      if (name !== 'this') {
        names.add(name);
      }
    }

    // Dev: ClassDeclaration containing `this.ɵcmp = ...` in a static block
    if (
      (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') &&
      isNode(node.id) &&
      (node.id as AstNode & { name?: string }).name
    ) {
      const className = (node.id as AstNode & { name: string }).name;
      if (classHasCmpDef(node)) {
        names.add(className);
      }
    }
  });

  return names;
}

function classHasCmpDef(classNode: AstNode): boolean {
  let found = false;

  walk(classNode, (node: any) => {
    if (found) return;

    // static ɵcmp = ... (PropertyDefinition)
    if (
      node.type === 'PropertyDefinition' &&
      node.static === true &&
      isNode(node.key) &&
      (node.key as AstNode & { name?: string }).name === 'ɵcmp'
    ) {
      found = true;
      return;
    }

    // static { this.ɵcmp = ... }
    if (
      node.type === 'AssignmentExpression' &&
      isNode(node.left) &&
      node.left.type === 'MemberExpression' &&
      isNode(node.left.property) &&
      (node.left.property as AstNode & { name?: string }).name === 'ɵcmp' &&
      isNode(node.left.object) &&
      node.left.object.type === 'ThisExpression'
    ) {
      found = true;
    }
  });

  return found;
}

function isNode(v: unknown): v is AstNode {
  return v != null && typeof v === 'object' && 'type' in (v as object);
}

function walk(node: AstNode, visitor: (n: AstNode) => void): void {
  visitor(node);
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (isNode(item)) walk(item, visitor);
      }
    } else if (isNode(child)) {
      walk(child, visitor);
    }
  }
}
