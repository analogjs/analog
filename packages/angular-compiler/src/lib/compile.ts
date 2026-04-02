import * as ts from 'typescript';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as o from '@angular/compiler';
import MagicString from 'magic-string';
import {
  ConstantPool,
  compileComponentFromMetadata,
  compileDirectiveFromMetadata,
  compilePipeFromMetadata,
  compileNgModule,
  compileInjector,
  R3NgModuleMetadataKind,
  R3SelectorScopeMode,
  FactoryTarget,
  compileFactoryFunction,
  parseTemplate,
  makeBindingParser,
  parseHostBindings,
  ParseSourceFile,
  ParseLocation,
  ParseSourceSpan,
  compileClassMetadata,
} from '@angular/compiler';
import { ComponentRegistry } from './registry.js';
import {
  collectTypeOnlyImports,
  findAllClasses,
  ANGULAR_DECORATORS,
} from './utils.js';

import {
  emitAngularExpr,
  emitAngularStmt,
  setEmitterSourceFile,
} from './js-emitter.js';
import {
  extractMetadata,
  detectSignals,
  detectFieldDecorators,
  extractConstructorDeps,
} from './metadata.js';
import { buildDeferDependencyMap } from './defer.js';

/** Detect installed Angular major version for compatibility. Supports 19+. */
const ANGULAR_MAJOR = (() => {
  try {
    const { VERSION } = require('@angular/compiler');
    return parseInt(VERSION?.major, 10) || 21;
  } catch {
    return 21;
  }
})();

/**
 * COMPLETE EXHAUSTIVE ANGULAR LITE COMPILER
 * Translates Angular Decorators + Signals to Ivy Static Definitions.
 *
 * @param registry - Optional external registry from the global analysis plugin.
 *   When provided, used to resolve component/directive selectors for template compilation.
 */
export interface CompileResult {
  code: string;
  /** Source map for the transformation */
  map: any;
  /** Absolute paths of external resources (templateUrl, styleUrl) read during compilation */
  resourceDependencies: string[];
}

export interface CompileOptions {
  registry?: ComponentRegistry;
  /** Pre-resolved style contents keyed by absolute file path (e.g. SCSS already compiled to CSS). */
  resolvedStyles?: Map<string, string>;
  /** Pre-processed inline styles (index in styles array → compiled CSS). */
  resolvedInlineStyles?: Map<number, string>;
}

export function compile(
  sourceCode: string,
  fileName: string,
  optionsOrRegistry?: CompileOptions | ComponentRegistry,
): CompileResult {
  // Backward compat: accept ComponentRegistry directly
  const opts: CompileOptions =
    optionsOrRegistry instanceof Map
      ? { registry: optionsOrRegistry }
      : optionsOrRegistry || {};
  const registry = opts.registry;
  const resolvedStyles = opts.resolvedStyles;
  const resolvedInlineStyles = opts.resolvedInlineStyles;
  const origSourceFile = ts.createSourceFile(
    fileName,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
  );
  const constantPool = new ConstantPool();
  const fileResourceImports: ts.ImportDeclaration[] = [];
  const resourceDependencies: string[] = [];
  const parseFile = new ParseSourceFile(sourceCode, fileName);
  const parseLoc = new ParseLocation(parseFile, 0, 0, 0);
  const typeSourceSpan = new ParseSourceSpan(parseLoc, parseLoc);
  const typeOnlyImports = collectTypeOnlyImports(origSourceFile);

  // Inject 'import * as i0 from "@angular/core"'
  const sourceFile = injectAngularImport(origSourceFile);

  // Build a file-local selector map as fallback when no external registry is provided.
  // Skip the expensive extractMetadata scan when a registry covers all classes.
  const localSelectors = new Map<string, string>();
  if (!registry) {
    sourceFile.statements.forEach((stmt) => {
      if (ts.isClassDeclaration(stmt) && stmt.name) {
        const meta = extractMetadata(ts.getDecorators(stmt)?.[0]);
        if (meta?.selector) {
          localSelectors.set(
            stmt.name.text,
            meta.selector.split(',')[0].trim(),
          );
        }
      }
    });
  }

  const bindingParser = makeBindingParser();
  setEmitterSourceFile(origSourceFile);

  // --- Direct walk: compile each Angular-decorated class and collect string outputs ---
  // This replaces the previous ts.transform + printer.printNode approach.
  // By emitting strings directly from the Angular output AST, we skip both
  // ts.factory node creation and ts.Printer serialization (~4x faster).
  interface ClassCompileResult {
    ivyCode: string[]; // "static ɵfac = ...", "static ɵcmp = ...", etc.
    decorators: ts.Decorator[]; // Angular decorators to remove
    classEnd: number; // Position of closing } in original source
  }
  const classResults: ClassCompileResult[] = [];
  // Track synthetic imports needed for NgModule export expansion.
  // Maps exported class name → import specifier.
  const syntheticImports = new Map<string, string>();

  // ANGULAR_DECORATORS imported from utils

  for (const node of findAllClasses(origSourceFile)) {
    const decorators = ts.getDecorators(node);
    if (!decorators || decorators.length === 0) continue;

    const className = node.name?.text;
    if (!className) continue;

    const angularDecorators = decorators.filter((dec) => {
      if (!ts.isCallExpression(dec.expression)) return false;
      const name = dec.expression.expression.getText(origSourceFile);
      return ANGULAR_DECORATORS.has(name);
    });
    if (angularDecorators.length === 0) continue;

    const ivyCode: string[] = [];
    let targetType: FactoryTarget = FactoryTarget.Injectable;
    // Store resolved resources per decorator for metadata inlining
    const resolvedResources = new Map<
      ts.Decorator,
      { template?: string; styles?: string[] }
    >();

    const classIdentifier = ts.factory.createIdentifier(className);
    const classRef: o.R3Reference = {
      value: new o.WrappedNodeExpr(classIdentifier),
      type: new o.WrappedNodeExpr(classIdentifier),
    };

    let classCompileError: Error | null = null;

    angularDecorators.forEach((dec) => {
      const decoratorName = (
        dec.expression as ts.CallExpression
      ).expression.getText(origSourceFile);
      const meta = extractMetadata(dec);
      const sigs = detectSignals(node);
      const fields = detectFieldDecorators(node);
      const hostBindings = parseHostBindings(meta.hostRaw || {});

      const hostMetadata: o.R3HostMetadata = {
        attributes: hostBindings.attributes,
        listeners: { ...hostBindings.listeners, ...fields.hostListeners },
        properties: { ...hostBindings.properties, ...fields.hostProperties },
        specialAttributes: hostBindings.specialAttributes,
      };

      switch (decoratorName) {
        case 'Component':
          targetType = FactoryTarget.Component;
          processResources();
          if (!meta.selector) {
            meta.selector = `ng-component-${className.toLowerCase()}`;
          }

          const declarations: any[] = [];
          for (const dep of Array.isArray(meta.imports) ? meta.imports : []) {
            const depClassName = dep.node.getText();
            const registryEntry = registry?.get(depClassName);

            if (registryEntry?.kind === 'ngmodule' && registryEntry.exports) {
              // Find the import specifier for this NgModule so we can
              // import its exported classes from the same package.
              let moduleSpecifier: string | undefined;
              for (const stmt of origSourceFile.statements) {
                if (
                  ts.isImportDeclaration(stmt) &&
                  stmt.importClause?.namedBindings &&
                  ts.isNamedImports(stmt.importClause.namedBindings)
                ) {
                  for (const el of stmt.importClause.namedBindings.elements) {
                    if (el.name.text === depClassName) {
                      moduleSpecifier = (
                        stmt.moduleSpecifier as ts.StringLiteral
                      ).text;
                    }
                  }
                }
              }

              for (const exportedName of registryEntry.exports) {
                const exportedEntry = registry?.get(exportedName);
                if (exportedEntry && exportedEntry.kind !== 'ngmodule') {
                  const kind = exportedEntry.kind === 'pipe' ? 1 : 0;
                  // Create a reference to the exported class. If it's not
                  // already imported, track it for synthetic import injection.
                  const exportedId = ts.factory.createIdentifier(exportedName);
                  const exportedRef = new o.WrappedNodeExpr(exportedId);
                  if (moduleSpecifier) {
                    syntheticImports.set(exportedName, moduleSpecifier);
                  }
                  const decl: any = {
                    type: exportedRef,
                    selector: exportedEntry.selector,
                    kind,
                    ...(kind === 1 ? { name: exportedEntry.pipeName } : {}),
                  };
                  if (exportedEntry.inputs) {
                    decl.inputs = Object.values(exportedEntry.inputs).map(
                      (i: any) => i.bindingPropertyName,
                    );
                  }
                  if (exportedEntry.outputs) {
                    decl.outputs = Object.values(exportedEntry.outputs);
                  }
                  declarations.push(decl);
                }
              }
              continue;
            }

            const selector =
              registryEntry?.selector ?? localSelectors.get(depClassName);
            const kind = registryEntry?.kind === 'pipe' ? 1 : 0;
            const decl: any = {
              type: dep,
              selector: selector || `_unresolved-${depClassName}`,
              kind,
              ...(kind === 1 ? { name: registryEntry?.pipeName } : {}),
            };
            // Pass inputs/outputs from registry so template bindings resolve.
            // R3DirectiveDependencyMetadata expects inputs/outputs as string[]
            // of binding property names.
            if (registryEntry?.inputs) {
              decl.inputs = Object.values(registryEntry.inputs).map(
                (i: any) => i.bindingPropertyName,
              );
            }
            if (registryEntry?.outputs) {
              decl.outputs = Object.values(registryEntry.outputs);
            }
            declarations.push(decl);
          }

          // Add self-reference so recursive components (e.g. tree views)
          // can use their own selector in their template.
          const selfInputs = Object.entries(sigs.inputs).map(
            ([, v]: [string, any]) => v.bindingPropertyName,
          );
          const selfOutputs = Object.values({
            ...meta.outputs,
            ...fields.outputs,
            ...sigs.outputs,
          });
          declarations.push({
            type: classRef.value,
            selector: meta.selector,
            kind: 0,
            ...(selfInputs.length > 0 ? { inputs: selfInputs } : {}),
            ...(selfOutputs.length > 0 ? { outputs: selfOutputs } : {}),
          });

          let templateContent = meta.template || '';
          if (!templateContent && meta.templateUrl) {
            try {
              const templatePath = path.resolve(
                path.dirname(fileName),
                meta.templateUrl,
              );
              templateContent = fs.readFileSync(templatePath, 'utf-8');
              resourceDependencies.push(templatePath);
            } catch {
              console.warn(
                `[angular-compiler] Could not read template file "${meta.templateUrl}" for ${className}`,
              );
            }
          }

          if (Array.isArray(meta.styleUrls)) {
            for (const url of meta.styleUrls) {
              try {
                const stylePath = path.resolve(path.dirname(fileName), url);
                const styleContent =
                  resolvedStyles?.get(stylePath) ??
                  fs.readFileSync(stylePath, 'utf-8');
                meta.styles.push(styleContent);
                resourceDependencies.push(stylePath);
              } catch {
                console.warn(
                  `[angular-compiler] Could not read style file "${url}" for ${className}`,
                );
              }
            }
          }

          if (resolvedInlineStyles) {
            for (const [idx, css] of resolvedInlineStyles) {
              if (idx < meta.styles.length) {
                meta.styles[idx] = css;
              }
            }
          }

          // Store resolved resources for metadata inlining
          resolvedResources.set(dec, {
            template: templateContent || undefined,
            styles: meta.styles?.length > 0 ? [...meta.styles] : undefined,
          });

          const parsedTemplate = parseTemplate(templateContent, fileName, {
            preserveWhitespaces: meta.preserveWhitespaces,
          });

          const ivyInputs: Record<string, any> = {};
          if (Array.isArray(meta.inputs)) {
            meta.inputs.forEach((i: string) => (ivyInputs[i] = i));
          } else if (meta.inputs) {
            Object.assign(ivyInputs, meta.inputs);
          }
          Object.assign(ivyInputs, fields.inputs);
          for (const [key, val] of Object.entries(sigs.inputs)) {
            const sigDesc = val as any;
            ivyInputs[key] = {
              classPropertyName: key,
              bindingPropertyName: key,
              isSignal: true,
              required: sigDesc.required || false,
              transformFunction: sigDesc.transform || null,
            };
          }
          const templateErrors = parsedTemplate.errors ?? [];
          if (templateErrors.length > 0) {
            const firstError = templateErrors[0];
            classCompileError = new Error(
              `[angular-compiler] Template parse error in ${fileName} (${className}): ${firstError.msg}`,
            );
            return;
          }

          const componentMeta: any = {
            ...meta,
            name: className,
            type: classRef,
            typeSourceSpan,
            declarations,
            template: {
              nodes: parsedTemplate.nodes,
              ngContentSelectors: parsedTemplate.ngContentSelectors,
              preserveWhitespaces: parsedTemplate.preserveWhitespaces,
            },
            styles: [...(meta.styles || []), ...(parsedTemplate.styles || [])],
            inputs: ivyInputs,
            outputs: { ...meta.outputs, ...fields.outputs, ...sigs.outputs },
            viewQueries: [...fields.viewQueries, ...sigs.viewQueries],
            queries: [...fields.contentQueries, ...sigs.contentQueries],
            host: hostMetadata,
            changeDetection: meta.changeDetection,
            encapsulation: meta.encapsulation,
            exportAs: meta.exportAs,
            providers: meta.providers?.length
              ? new o.LiteralArrayExpr(meta.providers)
              : null,
            viewProviders: meta.viewProviders?.length
              ? new o.LiteralArrayExpr(meta.viewProviders)
              : null,
            animations: meta.animations?.length
              ? new o.LiteralArrayExpr(meta.animations)
              : null,
            isStandalone: meta.standalone,
            imports: meta.imports,
            lifecycle: { usesOnChanges: false },
            defer: {
              mode: 0,
              blocks: buildDeferDependencyMap(
                parsedTemplate,
                sourceFile,
                registry,
                localSelectors,
              ).blocks,
            },
            declarationListEmitMode: 1,
            relativeContextFilePath: fileName,
            controlCreate: null,
          };

          if (ANGULAR_MAJOR >= 20) {
            componentMeta.hasDirectiveDependencies = declarations.length > 0;
          }

          const cmp = compileComponentFromMetadata(
            componentMeta,
            constantPool,
            bindingParser,
          );
          ivyCode.push(`static ɵcmp = ${emitAngularExpr(cmp.expression)}`);
          break;

        case 'Directive':
          targetType = FactoryTarget.Directive;
          const dir = compileDirectiveFromMetadata(
            {
              ...meta,
              name: className,
              type: classRef,
              typeSourceSpan,
              host: hostMetadata,
              inputs: { ...meta.inputs, ...fields.inputs, ...sigs.inputs },
              outputs: { ...meta.outputs, ...fields.outputs, ...sigs.outputs },
              viewQueries: [...fields.viewQueries, ...sigs.viewQueries],
              queries: [...fields.contentQueries, ...sigs.contentQueries],
              providers: meta.providers,
              exportAs: meta.exportAs,
              isStandalone: meta.standalone,
              lifecycle: { usesOnChanges: false },
            },
            constantPool,
            bindingParser,
          );
          ivyCode.push(`static ɵdir = ${emitAngularExpr(dir.expression)}`);
          break;

        case 'Pipe':
          targetType = FactoryTarget.Pipe;
          const pipe = compilePipeFromMetadata({
            ...meta,
            name: className,
            pipeName: meta.name,
            type: classRef,
            isStandalone: meta.standalone,
            pure: meta.pure ?? true,
          });
          ivyCode.push(`static ɵpipe = ${emitAngularExpr(pipe.expression)}`);
          break;

        case 'Injectable':
          targetType = FactoryTarget.Injectable;
          const inj = o.compileInjectable(
            {
              name: className,
              type: classRef,
              typeArgumentCount: 0,
              providedIn: {
                expression: new o.LiteralExpr(meta.providedIn || 'root'),
                forwardRef: 0,
              },
            },
            true,
          );
          ivyCode.push(`static ɵprov = ${emitAngularExpr(inj.expression)}`);
          break;

        case 'NgModule':
          targetType = FactoryTarget.NgModule;
          const ngModuleImports = Array.isArray(meta.imports)
            ? meta.imports
            : [];
          const ngModuleDeclarations = Array.isArray(meta.declarations)
            ? meta.declarations
            : [];
          const ngModuleExports = Array.isArray(meta.exports)
            ? meta.exports
            : [];
          const ngModuleBootstrap = Array.isArray(meta.bootstrap)
            ? meta.bootstrap
            : [];

          const ngMod = compileNgModule({
            kind: R3NgModuleMetadataKind.Global,
            type: classRef,
            bootstrap: ngModuleBootstrap.map((e: o.WrappedNodeExpr<any>) => ({
              value: e,
              type: e,
            })),
            declarations: ngModuleDeclarations.map(
              (e: o.WrappedNodeExpr<any>) => ({ value: e, type: e }),
            ),
            publicDeclarationTypes: null,
            imports: ngModuleImports.map((e: o.WrappedNodeExpr<any>) => ({
              value: e,
              type: e,
            })),
            includeImportTypes: true,
            exports: ngModuleExports.map((e: o.WrappedNodeExpr<any>) => ({
              value: e,
              type: e,
            })),
            selectorScopeMode: R3SelectorScopeMode.Inline,
            containsForwardDecls: false,
            schemas: [],
            id: null,
          });
          ivyCode.push(`static ɵmod = ${emitAngularExpr(ngMod.expression)}`);

          const injector = compileInjector({
            name: className,
            type: classRef,
            providers: meta.providers
              ? new o.LiteralArrayExpr(meta.providers)
              : null,
            imports: ngModuleImports.map((e: o.WrappedNodeExpr<any>) => e),
          });
          ivyCode.push(`static ɵinj = ${emitAngularExpr(injector.expression)}`);
          break;
      }
    });

    if (classCompileError) {
      throw classCompileError;
    }

    // Generate factory
    const deps = extractConstructorDeps(node, typeOnlyImports);
    if (deps === null) {
      const baseVar = `ɵ${className}_BaseFactory`;
      ivyCode.unshift(
        `static ɵfac = /*@__PURE__*/ (() => { let ${baseVar}; return function ${className}_Factory(__ngFactoryType__) { return (${baseVar} || (${baseVar} = i0.ɵɵgetInheritedFactory(${className})))(__ngFactoryType__ || ${className}); }; })()`,
      );
    } else if (deps === 'invalid') {
      ivyCode.unshift(
        `static ɵfac = function ${className}_Factory(__ngFactoryType__) { i0.ɵɵinvalidFactory(); }`,
      );
    } else {
      const fac = compileFactoryFunction({
        name: className,
        type: classRef,
        typeArgumentCount: 0,
        deps,
        target: targetType,
      });
      ivyCode.unshift(`static ɵfac = ${emitAngularExpr(fac.expression)}`);
    }

    // Emit setClassMetadata for runtime decorator reflection (devMode only)
    angularDecorators.forEach((dec) => {
      const call = dec.expression as ts.CallExpression;
      const decName = call.expression.getText(origSourceFile);
      let decArgsNode = call.arguments[0];

      // Inline external templateUrl/styleUrl(s) into the metadata so Angular's
      // runtime doesn't try to fetch relative URLs (which fails during SSR).
      const resources = resolvedResources.get(dec);
      if (
        decArgsNode &&
        ts.isObjectLiteralExpression(decArgsNode) &&
        resources
      ) {
        let needsTransform = false;
        const newProperties: ts.ObjectLiteralElementLike[] = [];

        for (const prop of (decArgsNode as ts.ObjectLiteralExpression)
          .properties) {
          if (!ts.isPropertyAssignment(prop)) {
            newProperties.push(prop);
            continue;
          }
          const propName = prop.name?.getText(origSourceFile);

          if (propName === 'templateUrl' && resources.template) {
            newProperties.push(
              ts.factory.createPropertyAssignment(
                'template',
                ts.factory.createStringLiteral(resources.template),
              ),
            );
            needsTransform = true;
          } else if (
            (propName === 'styleUrl' || propName === 'styleUrls') &&
            resources.styles?.length
          ) {
            newProperties.push(
              ts.factory.createPropertyAssignment(
                'styles',
                ts.factory.createArrayLiteralExpression(
                  resources.styles.map((s) =>
                    ts.factory.createStringLiteral(s),
                  ),
                ),
              ),
            );
            needsTransform = true;
          } else {
            newProperties.push(prop);
          }
        }

        if (needsTransform) {
          decArgsNode = ts.factory.createObjectLiteralExpression(
            newProperties,
            true,
          );
        }
      }

      try {
        const classMetadataExpr = compileClassMetadata({
          type: new o.WrappedNodeExpr(ts.factory.createIdentifier(className)),
          decorators: new o.LiteralArrayExpr([
            new o.LiteralMapExpr([
              new o.LiteralMapPropertyAssignment(
                'type',
                new o.WrappedNodeExpr(ts.factory.createIdentifier(decName)),
                false,
              ),
              ...(decArgsNode
                ? [
                    new o.LiteralMapPropertyAssignment(
                      'args',
                      new o.LiteralArrayExpr([
                        new o.WrappedNodeExpr(decArgsNode),
                      ]),
                      false,
                    ),
                  ]
                : []),
            ]),
          ]),
          ctorParameters: null,
          propDecorators: null,
        });
        constantPool.statements.push(
          new o.ExpressionStatement(classMetadataExpr),
        );
      } catch {
        // Skip if compileClassMetadata fails
      }
    });

    // Collect member decorators (@HostListener, @HostBinding, @Input, @Output,
    // @ViewChild, @ContentChild, etc.) so they are removed from the source.
    // The metadata has already been extracted by detectFieldDecorators().
    const memberDecorators: ts.Decorator[] = [];
    const MEMBER_DECORATOR_NAMES = new Set([
      'Input',
      'Output',
      'HostBinding',
      'HostListener',
      'ViewChild',
      'ViewChildren',
      'ContentChild',
      'ContentChildren',
    ]);
    for (const member of node.members) {
      const mDecorators = ts.getDecorators(member as any);
      if (!mDecorators) continue;
      for (const dec of mDecorators) {
        if (!ts.isCallExpression(dec.expression)) continue;
        const decName = dec.expression.expression.getText(origSourceFile);
        if (MEMBER_DECORATOR_NAMES.has(decName)) {
          memberDecorators.push(dec);
        }
      }
    }

    classResults.push({
      ivyCode,
      decorators: [...angularDecorators, ...memberDecorators],
      classEnd: node.getEnd(),
    });
  }

  // Apply edits via MagicString
  const ms = new MagicString(sourceCode, { filename: fileName });

  // 1. Prepend i0 import (skip if already present)
  if (!sourceCode.includes('import * as i0 from')) {
    ms.prepend('import * as i0 from "@angular/core";\n');
  }

  // 1b. Inject synthetic imports for NgModule-exported classes
  for (const [name, specifier] of syntheticImports) {
    const alreadyImported = origSourceFile.statements.some(
      (s) =>
        ts.isImportDeclaration(s) &&
        s.importClause?.namedBindings &&
        ts.isNamedImports(s.importClause.namedBindings) &&
        s.importClause.namedBindings.elements.some((e) => e.name.text === name),
    );
    if (!alreadyImported) {
      ms.prepend(`import { ${name} } from "${specifier}";\n`);
    }
  }

  // 2. For each compiled class: remove decorators + insert Ivy definitions
  for (const cr of classResults) {
    // Remove Angular decorators from source
    for (const dec of cr.decorators) {
      const start = dec.getStart(origSourceFile);
      const end = dec.getEnd();
      let trimEnd = end;
      while (
        trimEnd < sourceCode.length &&
        (sourceCode[trimEnd] === ' ' ||
          sourceCode[trimEnd] === '\n' ||
          sourceCode[trimEnd] === '\r')
      ) {
        trimEnd++;
      }
      ms.remove(start, trimEnd);
    }

    // Insert static members before closing }
    if (cr.ivyCode.length > 0) {
      const memberCode = cr.ivyCode.map((c) => '  ' + c + ';').join('\n');
      ms.appendLeft(cr.classEnd - 1, '\n' + memberCode + '\n');
    }
  }

  // 3. Emit constant pool statements.
  // Split into: helper declarations (const/function) that must appear before
  // the class (since static property initializers reference them), and
  // side-effect statements (setClassMetadata IIFEs) that go after.
  const helpers: string[] = [];
  const sideEffects: string[] = [];
  for (const s of constantPool.statements) {
    const code = emitAngularStmt(s);
    if (
      s instanceof o.ExpressionStatement &&
      s.expr instanceof o.InvokeFunctionExpr
    ) {
      sideEffects.push(code);
    } else {
      helpers.push(code);
    }
  }

  if (helpers.length > 0) {
    // Insert helpers after the last import / top-level non-class statement,
    // well before any class that references them.
    let insertPos = 0;
    for (const stmt of origSourceFile.statements) {
      if (
        ts.isImportDeclaration(stmt) ||
        (ts.isVariableStatement(stmt) &&
          !stmt.getText(origSourceFile).includes('class'))
      ) {
        insertPos = stmt.getEnd();
      } else if (!ts.isExportAssignment(stmt)) {
        // Stop at the first class or non-import/non-variable statement
        break;
      }
    }
    ms.appendLeft(insertPos, '\n' + helpers.join('\n') + '\n');
  }
  if (sideEffects.length > 0) {
    ms.append('\n\n' + sideEffects.join('\n'));
  }

  const map = ms.generateMap({
    source: fileName,
    file: fileName + '.js',
    includeContent: true,
    hires: 'boundary',
  });

  return {
    code: ms.toString(),
    map,
    resourceDependencies,
  };
}

/** Resources are read and inlined at compile time — no imports needed. */
function processResources() {
  return { imports: [] as ts.ImportDeclaration[] };
}

function injectAngularImport(sf: ts.SourceFile) {
  return ts.factory.updateSourceFile(sf, [
    ts.factory.createImportDeclaration(
      undefined,
      ts.factory.createImportClause(
        false,
        undefined,
        ts.factory.createNamespaceImport(ts.factory.createIdentifier('i0')),
      ),
      ts.factory.createStringLiteral('@angular/core'),
    ),
    ...sf.statements,
  ]);
}
function createStaticProperty(n: string, i: ts.Expression) {
  return ts.factory.createPropertyDeclaration(
    [ts.factory.createModifier(ts.SyntaxKind.StaticKeyword)],
    n,
    undefined,
    undefined,
    i,
  );
}
