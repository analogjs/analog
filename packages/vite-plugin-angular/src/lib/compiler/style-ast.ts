import { parseSync } from 'oxc-parser';

type ProgramNode = ReturnType<typeof parseSync>['program']['body'][number];

function getClassDeclaration(node: ProgramNode): any {
  return node.type === 'ExportNamedDeclaration' ||
    node.type === 'ExportDefaultDeclaration'
    ? (node as any).declaration
    : node;
}

function getPropertyKey(prop: any): string | undefined {
  return prop.key?.name || prop.key?.value;
}

function getTemplateLiteralText(node: any): string | undefined {
  if (node?.type !== 'TemplateLiteral' || node.quasis?.length !== 1) {
    return undefined;
  }

  return node.quasis[0].value.cooked || node.quasis[0].value.raw;
}

/**
 * Extract styleUrl/styleUrls values from Angular @Component decorators.
 */
export function extractStyleUrls(code: string, fileName: string): string[] {
  const urls: string[] = [];
  const { program } = parseSync(fileName, code);

  for (const node of program.body) {
    const decl = getClassDeclaration(node);
    if (!decl || decl.type !== 'ClassDeclaration') continue;

    for (const dec of decl.decorators || []) {
      const expr = dec.expression;
      if (!expr || expr.type !== 'CallExpression') continue;
      if (expr.callee?.name !== 'Component') continue;

      const arg = expr.arguments?.[0];
      if (!arg || arg.type !== 'ObjectExpression') continue;

      for (const prop of arg.properties) {
        if (prop.type !== 'Property') continue;
        const key = getPropertyKey(prop);
        const val = prop.value;

        if (
          key === 'styleUrl' &&
          val?.type === 'Literal' &&
          typeof val.value === 'string'
        ) {
          urls.push(val.value);
        }

        if (key === 'styleUrls' && val?.type === 'ArrayExpression') {
          for (const el of val.elements) {
            if (el?.type === 'Literal' && typeof el.value === 'string') {
              urls.push(el.value);
            }
          }
        }
      }
    }
  }

  return urls;
}

/**
 * Extract inline style strings from Angular @Component decorators.
 */
export function extractInlineStyles(code: string, fileName: string): string[] {
  const styles: string[] = [];
  const { program } = parseSync(fileName, code);

  for (const node of program.body) {
    const decl = getClassDeclaration(node);
    if (!decl || decl.type !== 'ClassDeclaration') continue;

    for (const dec of decl.decorators || []) {
      const expr = dec.expression;
      if (!expr || expr.type !== 'CallExpression') continue;
      if (expr.callee?.name !== 'Component') continue;

      const arg = expr.arguments?.[0];
      if (!arg || arg.type !== 'ObjectExpression') continue;

      for (const prop of arg.properties) {
        if (prop.type !== 'Property') continue;
        const key = getPropertyKey(prop);
        const val = prop.value;

        if (key !== 'styles') continue;

        if (val?.type === 'ArrayExpression') {
          for (const el of val.elements) {
            if (el?.type === 'Literal' && typeof el.value === 'string') {
              styles.push(el.value);
              continue;
            }

            const templateText = getTemplateLiteralText(el);
            if (templateText !== undefined) {
              styles.push(templateText);
            }
          }
        } else if (val?.type === 'Literal' && typeof val.value === 'string') {
          styles.push(val.value);
        } else {
          const templateText = getTemplateLiteralText(val);
          if (templateText !== undefined) {
            styles.push(templateText);
          }
        }
      }
    }
  }

  return styles;
}
