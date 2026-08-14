import { parseSync, type OxcError, type Severity } from 'oxc-parser';
import { relative } from 'node:path';
import { normalizePath } from 'vite';

export interface AnalogRouteIdiomDiagnostic {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  details?: string;
}

export interface AnalyzeAnalogRouteFileOptions {
  filename: string;
  code: string;
  routeFiles?: string[];
}

const PAGE_FILE_RE = /\.page\.ts$/;
const ROUTER_OUTLET_RE = /\bRouterOutlet\b|<router-outlet(?:\s|>)/;

export function analyzeAnalogRouteFile(
  options: AnalyzeAnalogRouteFileOptions,
): AnalogRouteIdiomDiagnostic[] {
  const { filename, code, routeFiles = [] } = options;
  const parseResult = parseSync(filename, code, {
    lang: 'ts',
    sourceType: 'module',
    range: true,
    showSemanticErrors: true,
  });

  const parseDiagnostics = parseResult.errors.map((error) =>
    toParseDiagnostic(error),
  );

  if (parseDiagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return parseDiagnostics;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program: any = parseResult.program;
  const exportedBindings = collectExportedBindings(program);
  const routeMetaBindingName = exportedBindings.routeMeta;
  const routeJsonLdBindingName = exportedBindings.routeJsonLd;
  const diagnostics = [...parseDiagnostics];

  const routeMetaInfo = routeMetaBindingName
    ? getRouteMetaInfo(program, routeMetaBindingName)
    : null;

  if (!exportedBindings.hasDefaultExport && !routeMetaInfo?.hasRedirect) {
    diagnostics.push({
      code: 'missing-default-export',
      severity: 'warning',
      message:
        'Route files should default-export the page component, unless they are redirect-only routes.',
      details:
        'Add `export default class ...` or define `routeMeta.redirectTo` for a redirect route.',
    });
  }

  if (exportedBindings.hasDefaultExport && routeMetaInfo?.hasRedirect) {
    diagnostics.push({
      code: 'redirect-with-component',
      severity: 'warning',
      message: 'Redirect routes should not also export a page component.',
      details:
        'Analog ignores the default export when `routeMeta.redirectTo` is present. Remove the component export or remove the redirect.',
    });
  }

  if (
    routeMetaInfo?.hasRedirect &&
    routeMetaInfo.redirectTo &&
    !routeMetaInfo.redirectTo.startsWith('/')
  ) {
    diagnostics.push({
      code: 'relative-redirect',
      severity: 'warning',
      message: '`routeMeta.redirectTo` should use an absolute path.',
      details:
        'Nested redirects are documented to use absolute targets such as `/cities/new-york`.',
    });
  }

  if (routeJsonLdBindingName) {
    diagnostics.push({
      code: 'legacy-route-jsonld-export',
      severity: 'warning',
      message:
        'Prefer `routeMeta.jsonLd` over the legacy top-level `routeJsonLd` export.',
      details:
        'Keeping JSON-LD inside `routeMeta` makes the route module easier to read and matches the current docs.',
    });
  }

  if (
    isLikelyLayoutRoute(filename, routeFiles) &&
    !ROUTER_OUTLET_RE.test(code)
  ) {
    diagnostics.push({
      code: 'layout-without-router-outlet',
      severity: 'warning',
      message:
        'This route file looks like a layout shell, but it does not reference `RouterOutlet` or `<router-outlet>`.',
      details:
        'Parent layout pages usually import `RouterOutlet` and render an outlet so child routes have somewhere to mount.',
    });
  }

  return diagnostics;
}

export function formatAnalogRouteIdiomDiagnostic(
  diagnostic: AnalogRouteIdiomDiagnostic,
  filename: string,
  workspaceRoot: string,
): string {
  const displayName = toDisplayPath(filename, workspaceRoot);
  const header = `[Analog] ${displayName} (${diagnostic.code})`;
  const severity = diagnostic.severity.toUpperCase();

  if (diagnostic.details) {
    return `${header}\n${severity}: ${diagnostic.message}\n${diagnostic.details}`;
  }

  return `${header}\n${severity}: ${diagnostic.message}`;
}

function toDisplayPath(filename: string, workspaceRoot: string): string {
  const normalizedFilename = normalizePath(filename);
  const normalizedRoot = normalizePath(workspaceRoot);
  const relativePath = normalizePath(
    relative(normalizedRoot, normalizedFilename),
  );

  if (relativePath && !relativePath.startsWith('..')) {
    return `/${relativePath}`;
  }

  return normalizedFilename;
}

function toParseDiagnostic(error: OxcError): AnalogRouteIdiomDiagnostic {
  return {
    code: 'oxc-parse',
    severity: error.severity === severityError ? 'error' : 'warning',
    message: error.message,
    details: error.codeframe ?? error.helpMessage ?? undefined,
  };
}

const severityError: Severity = 'Error';

function isLikelyLayoutRoute(filename: string, routeFiles: string[]): boolean {
  if (!PAGE_FILE_RE.test(filename)) {
    return false;
  }

  const routeStem = filename.replace(PAGE_FILE_RE, '');
  return routeFiles.some(
    (routeFile) =>
      routeFile !== filename && routeFile.startsWith(`${routeStem}/`),
  );
}

function getRouteMetaInfo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: any,
  bindingName: string,
): {
  hasRedirect: boolean;
  redirectTo?: string;
} | null {
  const initializer = getExportedBindingInitializer(program, bindingName);
  const routeMetaNode = unwrapRouteMetaObject(initializer);

  if (!routeMetaNode) {
    return null;
  }

  let redirectTo: string | undefined;

  for (const property of routeMetaNode.properties ?? []) {
    if (property?.type !== 'Property') {
      continue;
    }

    const keyName = getPropertyName(property.key);
    if (keyName !== 'redirectTo') {
      continue;
    }

    redirectTo = getStringValue(property.value);
  }

  return {
    hasRedirect: typeof redirectTo === 'string' && redirectTo.length > 0,
    redirectTo,
  };
}

function unwrapRouteMetaObject(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initializer: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any | null {
  if (!initializer) {
    return null;
  }

  if (initializer.type === 'ObjectExpression') {
    return initializer;
  }

  if (
    initializer.type === 'CallExpression' &&
    initializer.callee?.type === 'Identifier' &&
    initializer.callee.name === 'defineRouteMeta'
  ) {
    const firstArgument = initializer.arguments?.[0];
    return firstArgument?.type === 'ObjectExpression' ? firstArgument : null;
  }

  return null;
}

function getExportedBindingInitializer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: any,
  bindingName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any | undefined {
  for (const statement of program.body ?? []) {
    if (statement?.type === 'VariableDeclaration') {
      const initializer = getVariableInitializer(statement, bindingName);
      if (initializer) {
        return initializer;
      }
      continue;
    }

    if (
      statement?.type === 'ExportNamedDeclaration' &&
      statement.declaration?.type === 'VariableDeclaration'
    ) {
      const initializer = getVariableInitializer(
        statement.declaration,
        bindingName,
      );
      if (initializer) {
        return initializer;
      }
    }
  }

  return undefined;
}

function getVariableInitializer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  declaration: any,
  bindingName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any | undefined {
  for (const declarator of declaration.declarations ?? []) {
    if (
      declarator.id?.type === 'Identifier' &&
      declarator.id.name === bindingName
    ) {
      return declarator.init;
    }
  }

  return undefined;
}

function collectExportedBindings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: any,
): {
  hasDefaultExport: boolean;
  routeMeta?: string;
  routeJsonLd?: string;
} {
  let hasDefaultExport = false;
  let routeMeta: string | undefined;
  let routeJsonLd: string | undefined;

  for (const statement of program.body ?? []) {
    if (statement?.type === 'ExportDefaultDeclaration') {
      hasDefaultExport = true;
      continue;
    }

    if (statement?.type !== 'ExportNamedDeclaration') {
      continue;
    }

    const declaration = statement.declaration;
    if (declaration?.type === 'VariableDeclaration') {
      for (const declarator of declaration.declarations ?? []) {
        if (declarator.id?.type !== 'Identifier') {
          continue;
        }

        if (declarator.id.name === 'routeMeta') {
          routeMeta = 'routeMeta';
        }

        if (declarator.id.name === 'routeJsonLd') {
          routeJsonLd = 'routeJsonLd';
        }
      }
    }

    for (const specifier of statement.specifiers ?? []) {
      if (
        specifier?.type !== 'ExportSpecifier' ||
        specifier.local?.type !== 'Identifier'
      ) {
        continue;
      }

      if (specifier.exported?.type !== 'Identifier') {
        continue;
      }

      if (specifier.exported.name === 'routeMeta') {
        routeMeta = specifier.local.name;
      }

      if (specifier.exported.name === 'routeJsonLd') {
        routeJsonLd = specifier.local.name;
      }
    }
  }

  return {
    hasDefaultExport,
    routeMeta,
    routeJsonLd,
  };
}

function getPropertyName(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  node: any,
): string | undefined {
  if (node?.type === 'Identifier') {
    return node.name;
  }

  if (
    (node?.type === 'Literal' || node?.type === 'StringLiteral') &&
    typeof node.value === 'string'
  ) {
    return node.value;
  }

  return undefined;
}

function getStringValue(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  node: any,
): string | undefined {
  if (
    (node?.type === 'Literal' || node?.type === 'StringLiteral') &&
    typeof node.value === 'string'
  ) {
    return node.value;
  }

  if (
    node?.type === 'TemplateLiteral' &&
    node.expressions?.length === 0 &&
    node.quasis?.length === 1
  ) {
    return node.quasis[0].value.cooked ?? node.quasis[0].value.raw;
  }

  return undefined;
}
