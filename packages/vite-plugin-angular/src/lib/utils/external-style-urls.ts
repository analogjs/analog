import ts from 'typescript';

/** Browser references must not interpret a Windows drive letter as a URL scheme. */
export function externalStyleUrl(file: string): string {
  const normalized = file.replaceAll('\\', '/');
  return /^[a-z]:\//i.test(normalized) || normalized.startsWith('//')
    ? `/@fs/${normalized}`
    : file;
}

export const externalStyleUrlTransformer: ts.TransformerFactory<
  ts.SourceFile
> = (context) => {
  const visit: ts.Visitor = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'ɵɵExternalStylesFeature'
    ) {
      const urls = node.arguments[0];
      if (urls && ts.isArrayLiteralExpression(urls)) {
        const elements = urls.elements.map((element) => {
          if (!ts.isStringLiteral(element)) return element;
          const url = externalStyleUrl(element.text);
          return url === element.text
            ? element
            : ts.setTextRange(
                context.factory.createStringLiteral(url),
                element,
              );
        });
        return context.factory.updateCallExpression(
          node,
          node.expression,
          node.typeArguments,
          [
            context.factory.updateArrayLiteralExpression(urls, elements),
            ...node.arguments.slice(1),
          ],
        );
      }
    }
    return ts.visitEachChild(node, visit, context);
  };
  return (source) => ts.visitNode(source, visit, ts.isSourceFile) ?? source;
};

/** HMR metadata is standalone JavaScript and has no incoming source-map chain. */
export function externalStyleUrlsInHmr(code: string): string {
  if (process.platform !== 'win32') return code;
  const source = ts.createSourceFile(
    'angular-hmr.js',
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const transformed = ts.transform(source, [externalStyleUrlTransformer]);
  try {
    return ts.createPrinter().printFile(transformed.transformed[0] ?? source);
  } finally {
    transformed.dispose();
  }
}
