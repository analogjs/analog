import * as ts from 'typescript';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as o from '@angular/compiler';
import MagicString from 'magic-string';
import { parseSync } from 'oxc-parser';
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
  compileDeclareComponentFromMetadata,
  compileDeclareDirectiveFromMetadata,
  compileDeclarePipeFromMetadata,
  compileDeclareNgModuleFromMetadata,
  compileDeclareInjectorFromMetadata,
  compileDeclareInjectableFromMetadata,
  compileDeclareFactoryFunction,
  compileDeclareClassMetadata,
} from '@angular/compiler';
import { ComponentRegistry } from './registry.js';
import { findAllClasses } from './utils.js';
import { ANGULAR_DECORATORS, FIELD_DECORATORS } from './constants.js';
import {
  detectTypeOnlyImportNames,
  elideTypeOnlyImportsMagicString,
} from './type-elision.js';

import {
  emitAngularExpr,
  emitAngularStmt,
  setEmitterSourceFile,
  setEmitterSourceCode,
} from './js-emitter.js';
import { lowerClassFields } from './class-field-lowering.js';
import {
  extractMetadata,
  collectStringConstants,
  detectSignals,
  detectFieldDecorators,
  extractConstructorDeps,
} from './metadata.js';
import { buildDeferDependencyMap } from './defer.js';

/** Detect installed Angular major version for compatibility. Supports 19+. */
const ANGULAR_MAJOR = (() => {
  const major = Number.parseInt(o.VERSION?.major ?? '', 10);
  return Number.isFinite(major) && major > 0 ? major : 22;
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
  map: ReturnType<MagicString['generateMap']>;
  /** Absolute paths of external resources (templateUrl, styleUrl) read during compilation */
  resourceDependencies: string[];
}

export interface CompileOptions {
  registry?: ComponentRegistry;
  /** Pre-resolved style contents keyed by absolute file path (e.g. SCSS already compiled to CSS). */
  resolvedStyles?: Map<string, string>;
  /** Pre-processed inline styles (index in styles array → compiled CSS). */
  resolvedInlineStyles?: Map<number, string>;
  /**
   * When `false` (default), instance class field initializers are lowered to
   * constructor assignments (matching TypeScript's `useDefineForClassFields: false`
   * behavior). This is required for Angular's `inject()` and constructor DI to
   * work correctly with the standard Angular tsconfig.
   */
  useDefineForClassFields?: boolean;
  /** Enable legacy i18n message ID format (default: true). */
  enableI18nLegacyMessageIdFormat?: boolean;
  /** Normalize line endings in ICU expressions (default: true). */
  i18nNormalizeLineEndingsInICUs?: boolean;
  /** Use external IDs in `$localize` calls (for Closure Compiler compatibility). */
  i18nUseExternalIds?: boolean;
  /**
   * Compilation output mode.
   * - `'full'` (default): Emit final Ivy definitions (`ɵɵdefineComponent`) for application builds.
   * - `'partial'`: Emit partial declarations (`ɵɵngDeclareComponent`) for library publishing.
   *   Partial output is version-stable and linked at application build time.
   */
  compilationMode?: 'full' | 'partial';
}

type CompileMetadata = ReturnType<typeof extractMetadata>;

type CompileDeclaration = {
  type: o.Expression;
  selector: string | null;
  className?: string;
  kind: number;
  name?: string;
  inputs?: string[];
  outputs?: string[];
  exportAs?: string[];
  isComponent?: boolean;
};

function hasExportModifier(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    ts
      .getModifiers(node)
      ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) === true
  );
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
  const useDefineForClassFields = opts.useDefineForClassFields ?? false;
  const isPartial = opts.compilationMode === 'partial';
  const origSourceFile = ts.createSourceFile(
    fileName,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
  );
  // OXC parse for metadata extraction (faster than TS for decorator/signal analysis)
  const { program: oxcProgram } = parseSync(fileName, sourceCode);
  const oxcClassMap = new Map<string, any>();
  for (const stmt of oxcProgram.body) {
    const decl =
      stmt.type === 'ExportNamedDeclaration' ||
      stmt.type === 'ExportDefaultDeclaration'
        ? (stmt as any).declaration
        : stmt;
    if (
      decl &&
      (decl.type === 'ClassDeclaration' || decl.type === 'ClassExpression') &&
      decl.id?.name
    ) {
      oxcClassMap.set(decl.id.name, decl);
    }
  }

  // Collect module-level string constants so decorator metadata can resolve
  // template-literal interpolations like `template: \`<div class="${tw}">x</div>\``.
  const stringConsts = collectStringConstants(oxcProgram);

  const constantPool = new ConstantPool();
  const resourceDependencies: string[] = [];
  const parseFile = new ParseSourceFile(sourceCode, fileName);
  const parseLoc = new ParseLocation(parseFile, 0, 0, 0);
  const typeSourceSpan = new ParseSourceSpan(parseLoc, parseLoc);
  const typeOnlyImports = detectTypeOnlyImportNames(sourceCode);
  const importSpecifierByName = new Map<string, string>();
  const importedNames = new Set<string>();

  for (const stmt of origSourceFile.statements) {
    if (
      !ts.isImportDeclaration(stmt) ||
      !stmt.importClause?.namedBindings ||
      !ts.isNamedImports(stmt.importClause.namedBindings)
    ) {
      continue;
    }

    const moduleSpecifier = (stmt.moduleSpecifier as ts.StringLiteral).text;
    // Explicit `import type { X }` — declaration-level type-only import
    const isDeclarationTypeOnly = stmt.importClause.isTypeOnly;
    for (const element of stmt.importClause.namedBindings.elements) {
      const localName = element.name.text;
      importedNames.add(localName);
      importSpecifierByName.set(localName, moduleSpecifier);
      // Explicit `import { type X }` — specifier-level type-only import.
      // Both forms erase the symbol at runtime, so they cannot be used as
      // DI tokens. Add them to typeOnlyImports so extractConstructorDeps
      // surfaces ɵɵinvalidFactory() instead of emitting a broken
      // ɵɵdirectiveInject(X) referring to a non-existent value.
      if (isDeclarationTypeOnly || element.isTypeOnly) {
        typeOnlyImports.add(localName);
      }
    }
  }

  // Inject 'import * as i0 from "@angular/core"'
  const sourceFile = injectAngularImport(origSourceFile);

  // Build a file-local selector map as fallback when no external registry is provided.
  // Skip the expensive extractMetadata scan when a registry covers all classes.
  const localSelectors = new Map<string, string>();
  if (!registry) {
    for (const [clsName, oxcNode] of oxcClassMap) {
      const decs: any[] = oxcNode.decorators || [];
      if (decs.length > 0) {
        const meta = extractMetadata(decs[0], sourceCode, stringConsts);
        if (meta?.selector) {
          localSelectors.set(clsName, meta.selector.split(',')[0].trim());
        }
      }
    }
  }

  const bindingParser = isPartial ? undefined : makeBindingParser();
  setEmitterSourceFile(origSourceFile);
  setEmitterSourceCode(sourceCode);

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

    const classRef: o.R3Reference = {
      value: new o.WrappedNodeExpr(className),
      type: new o.WrappedNodeExpr(className),
    };

    // Detect `class Foo extends Bar` so the directive/component def
    // gets `usesInheritance: true`. Angular's compiler turns that into
    // `features: [InheritDefinitionFeature]`, which is what causes the
    // runtime to merge inputs/outputs/queries/host bindings from the
    // base class. Without it, derived directives like
    // `BrnPopover extends BrnDialog` lose every input declared on the
    // base, and any host directive that references those inputs by
    // public name fails at runtime with NG0311.
    const extendsClause = node.heritageClauses?.find(
      (h) => h.token === ts.SyntaxKind.ExtendsKeyword,
    );
    const usesInheritance = !!extendsClause && extendsClause.types.length > 0;

    // Look up the corresponding OXC class node for metadata extraction
    const oxcNode = oxcClassMap.get(className);

    let classCompileError: Error | null = null;

    angularDecorators.forEach((dec) => {
      const decoratorName = (
        dec.expression as ts.CallExpression
      ).expression.getText(origSourceFile);
      // Find the matching OXC decorator by name
      const oxcDec = oxcNode?.decorators?.find((d: any) => {
        const expr = d.expression;
        return (
          expr?.type === 'CallExpression' && expr.callee?.name === decoratorName
        );
      });
      const meta = extractMetadata(oxcDec, sourceCode, stringConsts);
      const sigs = oxcNode
        ? detectSignals(oxcNode, sourceCode)
        : { inputs: {}, outputs: {}, viewQueries: [], contentQueries: [] };
      const fields = oxcNode
        ? detectFieldDecorators(oxcNode, sourceCode)
        : {
            inputs: {},
            outputs: {},
            viewQueries: [],
            contentQueries: [],
            hostProperties: {},
            hostListeners: {},
          };
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
          if (!meta.selector) {
            meta.selector = `ng-component-${className.toLowerCase()}`;
          }

          const declarations: CompileDeclaration[] = [];
          for (const dep of Array.isArray(meta.imports) ? meta.imports : []) {
            const depNode = dep.node;
            const depClassName: string =
              typeof depNode === 'string'
                ? depNode
                : (depNode?.name ?? depNode?.type === 'Identifier')
                  ? depNode.name
                  : sourceCode.slice(depNode?.start ?? 0, depNode?.end ?? 0);
            const registryEntry = registry?.get(depClassName);

            if (registryEntry?.kind === 'ngmodule' && registryEntry.exports) {
              const moduleSpecifier = importSpecifierByName.get(depClassName);

              // Recursively collect all non-module exports (handles nested NgModules
              // like ReactiveFormsModule → ɵInternalFormsSharedModule → DefaultValueAccessor)
              const allExports: string[] = [];
              const expandModule = (
                moduleName: string,
                visited = new Set<string>(),
              ) => {
                if (visited.has(moduleName)) return;
                visited.add(moduleName);
                const mod = registry?.get(moduleName);
                if (!mod?.exports) return;
                for (const name of mod.exports) {
                  const entry = registry?.get(name);
                  if (!entry) continue;
                  if (entry.kind === 'ngmodule') {
                    expandModule(name, visited);
                  } else {
                    allExports.push(name);
                  }
                }
              };
              expandModule(depClassName);

              for (const exportedName of allExports) {
                const exportedEntry = registry?.get(exportedName);
                if (exportedEntry) {
                  const kind = exportedEntry.kind === 'pipe' ? 1 : 0;
                  // Create a reference to the exported class. If it's not
                  // already imported, track it for synthetic import injection.
                  const exportedRef = new o.WrappedNodeExpr(exportedName);
                  if (exportedEntry.sourcePackage || moduleSpecifier) {
                    syntheticImports.set(
                      exportedName,
                      exportedEntry.sourcePackage || moduleSpecifier!,
                    );
                  }
                  const decl: CompileDeclaration = {
                    type: exportedRef,
                    selector: exportedEntry.selector,
                    kind,
                    ...(kind === 1 ? { name: exportedEntry.pipeName } : {}),
                  };
                  if (exportedEntry.inputs) {
                    decl.inputs = Object.values(exportedEntry.inputs).map(
                      (i) => i.bindingPropertyName,
                    );
                  }
                  if (exportedEntry.outputs) {
                    decl.outputs = Object.values(
                      exportedEntry.outputs,
                    ) as string[];
                  }
                  declarations.push(decl);
                }
              }
              continue;
            }

            const selector =
              registryEntry?.selector ?? localSelectors.get(depClassName);
            const kind = registryEntry?.kind === 'pipe' ? 1 : 0;
            const decl: CompileDeclaration = {
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
                (i) => i.bindingPropertyName,
              );
            }
            if (registryEntry?.outputs) {
              decl.outputs = Object.values(registryEntry.outputs) as string[];
            }
            declarations.push(decl);
          }

          // Add self-reference so recursive components (e.g. tree views)
          // can use their own selector in their template.
          // Skip in partial mode — the linker handles self-resolution.
          if (!isPartial) {
            const selfInputs = Object.entries(sigs.inputs).map(
              ([, v]: [string, any]) => v.bindingPropertyName,
            );
            const selfOutputs = Object.values({
              ...meta.outputs,
              ...fields.outputs,
              ...sigs.outputs,
            }) as string[];
            declarations.push({
              type: classRef.value,
              selector: meta.selector,
              kind: 0,
              ...(selfInputs.length > 0 ? { inputs: selfInputs } : {}),
              ...(selfOutputs.length > 0 ? { outputs: selfOutputs } : {}),
            });
          }

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
            enableI18nLegacyMessageIdFormat:
              opts.enableI18nLegacyMessageIdFormat ?? true,
            i18nNormalizeLineEndingsInICUs:
              opts.i18nNormalizeLineEndingsInICUs ?? true,
          });

          const ivyInputs: Record<string, unknown> = {};
          if (Array.isArray(meta.inputs)) {
            meta.inputs.forEach((i: string) => (ivyInputs[i] = i));
          } else if (meta.inputs) {
            Object.assign(ivyInputs, meta.inputs);
          }
          Object.assign(ivyInputs, fields.inputs);
          for (const [key, val] of Object.entries(sigs.inputs)) {
            const sigDesc = val as {
              bindingPropertyName?: string;
              required?: boolean;
              transform?: o.Expression | null;
            };
            ivyInputs[key] = {
              classPropertyName: key,
              // Honor the binding name (alias) extracted by detectSignals
              // so `input(null, { alias: 'aria-label' })` registers with
              // the public name `aria-label`, not the class property name.
              bindingPropertyName: sigDesc.bindingPropertyName ?? key,
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

          const componentMeta: CompileMetadata & {
            name: string;
            type: o.R3Reference;
            typeSourceSpan: ParseSourceSpan;
            declarations: CompileDeclaration[];
            template: {
              nodes: o.Node[];
              ngContentSelectors: string[];
              preserveWhitespaces: boolean;
            };
          } = {
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
            changeDetection: meta.changeDetection ?? (isPartial ? null : 1),
            encapsulation: meta.encapsulation ?? 0,
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
            usesInheritance,
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
            i18nUseExternalIds: opts.i18nUseExternalIds ?? false,
            relativeContextFilePath: fileName,
            controlCreate: null,
          };

          if (ANGULAR_MAJOR >= 20) {
            componentMeta.hasDirectiveDependencies =
              declarations.length > 0 ||
              (Array.isArray(meta.imports) && meta.imports.length > 0);
          }

          if (isPartial) {
            // Partial compilation accesses .inputs, .outputs, .exportAs on
            // each declaration — ensure they are arrays (not undefined).
            componentMeta.declarations = declarations.map((d) => ({
              ...d,
              inputs: d.inputs ?? null,
              outputs: d.outputs ?? null,
              exportAs: d.exportAs ?? null,
              isComponent: d.isComponent ?? false,
            }));
            const cmp = compileDeclareComponentFromMetadata(
              componentMeta,
              parsedTemplate,
              {
                content: templateContent,
                sourceUrl: fileName,
                isInline: !meta.templateUrl,
                inlineTemplateLiteralExpression: null,
              },
            );
            ivyCode.push(`static ɵcmp = ${emitAngularExpr(cmp.expression)}`);
          } else {
            const cmp = compileComponentFromMetadata(
              componentMeta,
              constantPool,
              bindingParser!,
            );
            ivyCode.push(`static ɵcmp = ${emitAngularExpr(cmp.expression)}`);
          }
          break;

        case 'Directive':
          targetType = FactoryTarget.Directive;
          // Build proper input descriptors (same as Component path)
          const dirInputs: Record<string, unknown> = {};
          if (Array.isArray(meta.inputs)) {
            meta.inputs.forEach((i: string) => (dirInputs[i] = i));
          } else if (meta.inputs) {
            Object.assign(dirInputs, meta.inputs);
          }
          Object.assign(dirInputs, fields.inputs);
          for (const [key, val] of Object.entries(sigs.inputs)) {
            const sigDesc = val as {
              bindingPropertyName?: string;
              required?: boolean;
              transform?: o.Expression | null;
            };
            dirInputs[key] = {
              classPropertyName: key,
              // Honor the binding name (alias) extracted by detectSignals.
              bindingPropertyName: sigDesc.bindingPropertyName ?? key,
              isSignal: true,
              required: sigDesc.required || false,
              transformFunction: sigDesc.transform || null,
            };
          }
          const directiveMeta = {
            ...meta,
            // Abstract base directives are declared as `@Directive()` with
            // no metadata. Angular's R3DirectiveMetadata accepts
            // `selector: string | null`, but the downstream selector parser
            // calls `.replace()` on the value and crashes on `undefined`.
            // Coerce missing selectors to `null` so abstract base classes
            // compile correctly.
            selector: meta.selector ?? null,
            name: className,
            type: classRef,
            typeSourceSpan,
            host: hostMetadata,
            inputs: dirInputs,
            outputs: { ...meta.outputs, ...fields.outputs, ...sigs.outputs },
            viewQueries: [...fields.viewQueries, ...sigs.viewQueries],
            queries: [...fields.contentQueries, ...sigs.contentQueries],
            // Angular's compiler treats `providers` as an Expression and
            // emits `ɵɵProvidersFeature(<expr>)` whenever it is truthy.
            // Passing the bare JS array of WrappedNodeExpr from
            // extractMetadata causes the emitter to lower it to `null`,
            // which then crashes Angular at runtime in `resolveProvider`
            // because it tries to read `.provide` on `null`. Wrap into a
            // LiteralArrayExpr (matching the Component branch) so it
            // emits a real array literal — and pass `null` when there are
            // no providers so Angular skips the feature entirely.
            providers: meta.providers?.length
              ? new o.LiteralArrayExpr(meta.providers)
              : null,
            exportAs: meta.exportAs,
            isStandalone: meta.standalone,
            lifecycle: { usesOnChanges: false },
            usesInheritance,
            controlCreate: null,
          };
          if (isPartial) {
            const dir = compileDeclareDirectiveFromMetadata(directiveMeta);
            ivyCode.push(`static ɵdir = ${emitAngularExpr(dir.expression)}`);
          } else {
            const dir = compileDirectiveFromMetadata(
              directiveMeta,
              constantPool,
              bindingParser!,
            );
            ivyCode.push(`static ɵdir = ${emitAngularExpr(dir.expression)}`);
          }
          break;

        case 'Pipe':
          targetType = FactoryTarget.Pipe;
          const pipeMeta = {
            ...meta,
            name: className,
            pipeName: meta.name,
            type: classRef,
            isStandalone: meta.standalone,
            pure: meta.pure ?? true,
          };
          if (isPartial) {
            const pipe = compileDeclarePipeFromMetadata(pipeMeta);
            ivyCode.push(`static ɵpipe = ${emitAngularExpr(pipe.expression)}`);
          } else {
            const pipe = compilePipeFromMetadata(pipeMeta);
            ivyCode.push(`static ɵpipe = ${emitAngularExpr(pipe.expression)}`);
          }
          break;

        case 'Injectable':
          targetType = FactoryTarget.Injectable;
          const injectableMeta = {
            name: className,
            type: classRef,
            typeArgumentCount: 0,
            providedIn: {
              expression: new o.LiteralExpr(meta.providedIn || 'root'),
              forwardRef: 0,
            },
          };
          if (isPartial) {
            const inj = compileDeclareInjectableFromMetadata(injectableMeta);
            ivyCode.push(`static ɵprov = ${emitAngularExpr(inj.expression)}`);
          } else {
            const inj = o.compileInjectable(injectableMeta, true);
            ivyCode.push(`static ɵprov = ${emitAngularExpr(inj.expression)}`);
          }
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

          const ngModuleMeta = {
            kind: R3NgModuleMetadataKind.Global as const,
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
          };
          const injectorMeta = {
            name: className,
            type: classRef,
            providers: meta.providers
              ? new o.LiteralArrayExpr(meta.providers)
              : null,
            imports: ngModuleImports.map((e: o.WrappedNodeExpr<any>) => e),
          };
          if (isPartial) {
            const ngMod = compileDeclareNgModuleFromMetadata(ngModuleMeta);
            ivyCode.push(`static ɵmod = ${emitAngularExpr(ngMod.expression)}`);
            const injector = compileDeclareInjectorFromMetadata(injectorMeta);
            ivyCode.push(
              `static ɵinj = ${emitAngularExpr(injector.expression)}`,
            );
          } else {
            const ngMod = compileNgModule(ngModuleMeta);
            ivyCode.push(`static ɵmod = ${emitAngularExpr(ngMod.expression)}`);
            const injector = compileInjector(injectorMeta);
            ivyCode.push(
              `static ɵinj = ${emitAngularExpr(injector.expression)}`,
            );
          }
          break;
      }
    });

    if (classCompileError) {
      throw classCompileError;
    }

    // Generate factory
    const deps = oxcNode
      ? extractConstructorDeps(oxcNode, sourceCode, typeOnlyImports)
      : [];
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
      const factoryMeta = {
        name: className,
        type: classRef,
        typeArgumentCount: 0,
        deps,
        target: targetType,
      };
      if (isPartial) {
        const fac = compileDeclareFactoryFunction(factoryMeta);
        ivyCode.unshift(`static ɵfac = ${emitAngularExpr(fac.expression)}`);
      } else {
        const fac = compileFactoryFunction(factoryMeta);
        ivyCode.unshift(`static ɵfac = ${emitAngularExpr(fac.expression)}`);
      }
    }

    // Emit setClassMetadata for runtime decorator reflection (devMode only)
    angularDecorators.forEach((dec) => {
      const call = dec.expression as ts.CallExpression;
      const decName = call.expression.getText(origSourceFile);
      const decArgsNode = call.arguments[0];

      // Build the decorator args for setClassMetadata, inlining resources if needed.
      const resources = resolvedResources.get(dec);
      let metadataArgsExpr: string | null = null;
      if (decArgsNode) {
        if (resources && ts.isObjectLiteralExpression(decArgsNode)) {
          // Inline external templateUrl/styleUrl(s) into the metadata so Angular's
          // runtime doesn't try to fetch relative URLs (which fails during SSR).
          const rewrittenProps: string[] = [];
          let needsTransform = false;
          for (const prop of (decArgsNode as ts.ObjectLiteralExpression)
            .properties) {
            if (!ts.isPropertyAssignment(prop)) {
              rewrittenProps.push(prop.getText(origSourceFile));
              continue;
            }
            const propName = prop.name?.getText(origSourceFile);

            if (propName === 'templateUrl' && resources.template) {
              rewrittenProps.push(
                `template: ${JSON.stringify(resources.template)}`,
              );
              needsTransform = true;
            } else if (
              (propName === 'styleUrl' || propName === 'styleUrls') &&
              resources.styles?.length
            ) {
              rewrittenProps.push(
                `styles: [${resources.styles.map((s) => JSON.stringify(s)).join(', ')}]`,
              );
              needsTransform = true;
            } else {
              rewrittenProps.push(prop.getText(origSourceFile));
            }
          }
          metadataArgsExpr = needsTransform
            ? `{${rewrittenProps.join(', ')}}`
            : decArgsNode.getText(origSourceFile);
        } else {
          metadataArgsExpr = decArgsNode.getText(origSourceFile);
        }
      }

      try {
        const classMetaInput = {
          type: new o.WrappedNodeExpr(ts.factory.createIdentifier(className)),
          decorators: new o.LiteralArrayExpr([
            new o.LiteralMapExpr([
              new o.LiteralMapPropertyAssignment(
                'type',
                new o.WrappedNodeExpr(decName),
                false,
              ),
              ...(metadataArgsExpr
                ? [
                    new o.LiteralMapPropertyAssignment(
                      'args',
                      new o.LiteralArrayExpr([
                        new o.WrappedNodeExpr(metadataArgsExpr),
                      ]),
                      false,
                    ),
                  ]
                : []),
            ]),
          ]),
          ctorParameters: null,
          propDecorators: null,
        };
        const classMetadataExpr = isPartial
          ? compileDeclareClassMetadata(classMetaInput)
          : compileClassMetadata(classMetaInput);
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
    for (const member of node.members) {
      const mDecorators = ts.getDecorators(member as any);
      if (!mDecorators) continue;
      for (const dec of mDecorators) {
        if (!ts.isCallExpression(dec.expression)) continue;
        const decName = dec.expression.expression.getText(origSourceFile);
        if (FIELD_DECORATORS.has(decName)) {
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
    if (!importedNames.has(name)) {
      ms.prepend(`import { ${name} } from "${specifier}";\n`);
      importedNames.add(name);
    }
  }

  // 2a. Hoist non-exported variable/function declarations that appear after
  // a class to just before the first class. This avoids TDZ errors when
  // static ɵcmp references file-level constants declared after the class.
  if (classResults.length > 0) {
    const firstClassStart = classResults[0].classEnd - 1; // approx
    // Find the position right before the first class
    let firstClassPos = Infinity;
    for (const stmt of origSourceFile.statements) {
      if (ts.isClassDeclaration(stmt)) {
        firstClassPos = stmt.getStart(origSourceFile);
        break;
      }
    }
    for (const stmt of origSourceFile.statements) {
      const stmtStart = stmt.getStart(origSourceFile);
      // Only hoist statements that come after the first class
      if (stmtStart <= firstClassPos) continue;
      // Hoist variable statements and function declarations (not exported)
      const isHoistable =
        (ts.isVariableStatement(stmt) && !hasExportModifier(stmt)) ||
        (ts.isFunctionDeclaration(stmt) && !hasExportModifier(stmt));
      if (isHoistable) {
        const text = stmt.getText(origSourceFile);
        ms.remove(stmtStart, stmt.getEnd());
        ms.appendLeft(firstClassPos, text + '\n');
      }
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
    // Detect which imported names are type-only so we skip imports that will
    // be fully removed by elideTypeOnlyImportsMagicString (step 4).
    // Inserting at a position inside a soon-to-be-removed range would cause
    // MagicString to discard the helpers along with the import.
    const willElide = detectTypeOnlyImportNames(ms.toString());

    let insertPos = 0;
    for (const stmt of origSourceFile.statements) {
      if (ts.isImportDeclaration(stmt)) {
        // Skip imports that will be entirely removed by type elision
        if (willElide.size > 0 && stmt.importClause) {
          const clause = stmt.importClause;
          const namedBindings =
            clause.namedBindings && ts.isNamedImports(clause.namedBindings)
              ? clause.namedBindings.elements
              : undefined;
          const defaultName = clause.name;
          const allElided =
            (!defaultName || willElide.has(defaultName.text)) &&
            (!namedBindings ||
              namedBindings.every(
                (el) => el.isTypeOnly || willElide.has(el.name.text),
              ));
          if (allElided) continue;
        }
        insertPos = stmt.getEnd();
      } else if (
        ts.isVariableStatement(stmt) &&
        !stmt.getText(origSourceFile).includes('class')
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

  // 4. Lower class field initializers to constructor assignments when
  //    useDefineForClassFields is false (standard Angular tsconfig).
  //    Uses the original OXC AST positions which are still valid for MagicString
  //    since MagicString tracks edits relative to the original source.
  //    Ivy static definitions (ɵcmp, ɵfac) are not in the original AST so they
  //    are unaffected, and shouldLowerField skips static fields regardless.
  if (!useDefineForClassFields) {
    lowerClassFields(ms, sourceCode, oxcProgram);
  }

  // 5. Elide imports that are only used in type positions (type annotations,
  //    implements, generics, etc.).  Without this pass, single-file transpilers
  //    like OXC / esbuild cannot tell that `import { SomeType }` is type-only
  //    and will leave the import in the output, causing runtime errors.
  elideTypeOnlyImportsMagicString(ms);

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
