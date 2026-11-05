import * as fs from 'node:fs';
import * as path from 'node:path';
import * as o from '@angular/compiler';
import MagicString from 'magic-string';
import type { parseSync } from 'oxc-parser';
import { parseOxc } from './utils.js';
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
import {
  findAllClasses,
  resolveSyntheticImportSpecifier,
  walkOxc,
} from './utils.js';
import { ANGULAR_DECORATORS, FIELD_DECORATORS } from './constants.js';
import { angularVersionAtLeast } from './angular-version.js';
import {
  detectTypeOnlyImportNames,
  elideTypeOnlyImportsMagicString,
} from './type-elision.js';

import {
  emitAngularExpr,
  emitAngularStmt,
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
import { buildCtorParameters, buildPropDecorators } from './jit-metadata.js';
import { debugCompile, debugEmit } from './debug.js';
import { inlineStyleRanges } from './style-ast.js';

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
  /**
   * Pre-parsed OXC program of `sourceCode`, so callers that already parsed
   * the identical string can avoid a re-parse. Treated as read-only.
   */
  oxcProgram?: ReturnType<typeof parseSync>['program'];
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

/** A top-level statement with any `export` wrapper unwrapped. */
interface TopLevelStatement {
  /** The declaration (or the statement itself when not exported). */
  decl: any;
  exported: boolean;
  /** Start of the whole statement, including leading class decorators. */
  start: number;
  end: number;
}

function toTopLevelStatement(stmt: any): TopLevelStatement {
  const isExport =
    (stmt.type === 'ExportNamedDeclaration' ||
      stmt.type === 'ExportDefaultDeclaration') &&
    stmt.declaration;
  const decl = isExport ? stmt.declaration : stmt;
  return {
    decl,
    exported: !!isExport,
    start: Math.min(stmt.start, decl.decorators?.[0]?.start ?? stmt.start),
    end: stmt.end,
  };
}

/** Get the callee name of a decorator call, e.g. `Component` for `@Component(...)`. */
function decoratorCallName(dec: any, sourceCode: string): string | undefined {
  const callee = dec.expression;
  if (callee?.type !== 'CallExpression') return undefined;
  return sourceCode.slice(callee.callee.start, callee.callee.end);
}

/**
 * Normalize a `providers` / `viewProviders` metadata value into the single
 * `o.Expression` Angular's injector/host emitters expect.
 *
 * `extractMetadata` stores these as an array of `WrappedNodeExpr` when the
 * source used an inline array literal (`providers: [A, B]`) — those get
 * wrapped in a `LiteralArrayExpr`. When the source referenced a const,
 * spread, or call instead (`providers: safeProviders`), it stores the raw
 * expression, which is emitted by value. Returns `null` when there is
 * nothing to emit so callers skip the feature entirely.
 */
function providersToExpr(
  value: o.Expression[] | o.Expression | undefined | null,
): o.Expression | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value.length ? new o.LiteralArrayExpr(value) : null;
  }
  return value;
}

const LAZY_SCOPE_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'ClassDeclaration',
  'ClassExpression',
  'TSFunctionType',
  'TSConstructorType',
  'TSMethodSignature',
  'TSCallSignatureDeclaration',
  'TSConstructSignatureDeclaration',
]);

/**
 * Collect identifier names referenced in eagerly-evaluated code only.
 * Skips function/arrow/class bodies so that lazy references
 * (e.g. `const TOKEN = () => LaterClass`) are not treated as dependencies.
 * The root node's own children are always walked.
 */
function collectIdentifiers(root: any): Set<string> {
  const ids = new Set<string>();
  walkOxc(root, (n) => {
    if (n.type === 'Identifier') ids.add(n.name);
    return n === root || !LAZY_SCOPE_TYPES.has(n.type);
  });
  return ids;
}

/** Extract the names defined by a top-level declaration. */
function getDefinedNames(decl: any): string[] {
  if (decl.type === 'VariableDeclaration') {
    const names: string[] = [];
    for (const d of decl.declarations) {
      collectBindingNames(d.id, names);
    }
    return names;
  }
  if (
    (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') &&
    decl.id
  ) {
    return [decl.id.name];
  }
  return [];
}

/** Recursively collect all bound identifiers from a binding pattern. */
function collectBindingNames(pattern: any, out: string[]): void {
  if (!pattern) return;
  switch (pattern.type) {
    case 'Identifier':
      out.push(pattern.name);
      break;
    case 'ObjectPattern':
      for (const prop of pattern.properties) {
        collectBindingNames(
          prop.type === 'RestElement' ? prop.argument : prop.value,
          out,
        );
      }
      break;
    case 'ArrayPattern':
      for (const el of pattern.elements) collectBindingNames(el, out);
      break;
    case 'RestElement':
      collectBindingNames(pattern.argument, out);
      break;
    case 'AssignmentPattern':
      collectBindingNames(pattern.left, out);
      break;
  }
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
  const startTimeMs = debugCompile.enabled ? performance.now() : 0;
  debugCompile(
    'compile %s (mode=%s, registry=%d entries)',
    fileName,
    isPartial ? 'partial' : 'full',
    registry?.size ?? 0,
  );
  const oxcProgram = opts.oxcProgram ?? parseOxc(fileName, sourceCode).program;
  const styleRanges = resolvedInlineStyles && inlineStyleRanges(oxcProgram);
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
  const typeOnlyImports = detectTypeOnlyImportNames(sourceCode, oxcProgram);
  const importSpecifierByName = new Map<string, string>();
  const importedNames = new Set<string>();
  const typeOnlyImportedNames = new Set<string>();

  for (const stmt of oxcProgram.body as any[]) {
    if (stmt.type !== 'ImportDeclaration') continue;

    const moduleSpecifier: string = stmt.source.value;
    // Explicit `import type { X }` — declaration-level type-only import
    const isDeclarationTypeOnly = stmt.importKind === 'type';
    for (const element of stmt.specifiers) {
      if (element.type !== 'ImportSpecifier') continue;
      const localName: string = element.local.name;
      importSpecifierByName.set(localName, moduleSpecifier);
      // Explicit `import { type X }` — specifier-level type-only import.
      // Both forms erase the symbol at runtime, so they cannot be used as
      // DI tokens. Add them to typeOnlyImports so extractConstructorDeps
      // surfaces ɵɵinvalidFactory() instead of emitting a broken
      // ɵɵdirectiveInject(X) referring to a non-existent value.
      if (isDeclarationTypeOnly || element.importKind === 'type') {
        typeOnlyImports.add(localName);
        typeOnlyImportedNames.add(localName);
      } else {
        importedNames.add(localName);
      }
    }
  }

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
  setEmitterSourceCode(sourceCode);

  // --- Direct walk: compile each Angular-decorated class and collect string outputs ---
  interface ClassCompileResult {
    ivyCode: string[]; // "static ɵfac = ...", "static ɵcmp = ...", etc.
    decorators: any[]; // Angular decorators to remove (OXC nodes)
    classEnd: number; // Position of closing } in original source
    // setClassMetadata calls for classes nested in a function scope, which
    // must be emitted next to the class rather than at module scope.
    scopedMetadata: o.Statement[];
  }
  const classResults: ClassCompileResult[] = [];
  const topLevelClasses = new Set(
    (oxcProgram.body as any[]).map((stmt) => toTopLevelStatement(stmt).decl),
  );
  // Track synthetic imports needed for NgModule export expansion.
  // Maps exported class name → import specifier.
  const syntheticImports = new Map<string, string>();
  // A type-only import is erased at runtime, so its synthetic value import
  // needs an alias to avoid redeclaring the type-only binding.
  const dependencyLocalName = (name: string) =>
    typeOnlyImportedNames.has(name) ? `ɵngDep_${name}` : name;

  // ANGULAR_DECORATORS imported from utils

  for (const node of findAllClasses(oxcProgram)) {
    const decorators: any[] = node.decorators;
    if (!decorators || decorators.length === 0) continue;

    const className: string | undefined = node.id?.name;
    if (!className) continue;

    const angularDecorators = decorators.filter((dec) =>
      ANGULAR_DECORATORS.has(decoratorCallName(dec, sourceCode) ?? ''),
    );
    if (angularDecorators.length === 0) continue;

    const ivyCode: string[] = [];
    let targetType: FactoryTarget = FactoryTarget.Injectable;
    // Store resolved resources per decorator for metadata inlining
    const resolvedResources = new Map<
      any,
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
    const usesInheritance = !!node.superClass;

    let classCompileError: Error | null = null;

    angularDecorators.forEach((dec) => {
      const decoratorName = decoratorCallName(dec, sourceCode)!;
      const meta = extractMetadata(dec, sourceCode, stringConsts);
      const sigs = detectSignals(node, sourceCode);
      const fields = detectFieldDecorators(node, sourceCode);
      const hostBindings = parseHostBindings(meta.hostRaw || {});

      const hostMetadata: o.R3HostMetadata = {
        attributes: hostBindings.attributes,
        listeners: { ...hostBindings.listeners, ...fields.hostListeners },
        properties: { ...hostBindings.properties, ...fields.hostProperties },
        specialAttributes: hostBindings.specialAttributes,
      };

      switch (decoratorName) {
        case 'Component': {
          targetType = FactoryTarget.Component;
          if (!meta.selector) {
            meta.selector = `ng-component-${className.toLowerCase()}`;
          }

          const declarations: CompileDeclaration[] = [];
          // Dedupe by class name across direct imports, tuple-barrel
          // expansion, and NgModule export expansion so the final
          // `dependencies: () => [...]` list never contains the same
          // class twice. Otherwise Angular's runtime throws NG0300
          // ("Multiple components match …") when a file lists both
          // `NgIcon` and a barrel like `HlmIconImports = [HlmIcon, NgIcon]`
          // that re-exports it, or when two NgModules re-export the same
          // directive (e.g. FormsModule + ReactiveFormsModule →
          // DefaultValueAccessor).
          const seenDeclarationNames = new Set<string>();

          // Expand `imports` entries that are not directives themselves
          // (e.g. NgModules and tuple barrels like `HlmSelectImports =
          // [HlmSelect, HlmSelectContent, ...] as const`) into the
          // underlying directive class names. Returns the original entry
          // when it doesn't match either expansion case.
          const collectExpandedImports = (
            depClassName: string,
            visited: Set<string>,
          ): string[] => {
            if (visited.has(depClassName)) return [];
            visited.add(depClassName);
            const entry = registry?.get(depClassName);
            if (!entry) return [depClassName];
            if (entry.kind === 'ngmodule' && entry.exports) {
              const out: string[] = [];
              for (const name of entry.exports) {
                out.push(...collectExpandedImports(name, visited));
              }
              return out;
            }
            if (entry.kind === 'tuple' && entry.members) {
              const out: string[] = [];
              for (const name of entry.members) {
                out.push(...collectExpandedImports(name, visited));
              }
              return out;
            }
            return [depClassName];
          };

          for (const dep of Array.isArray(meta.imports) ? meta.imports : []) {
            const depNode = dep.node;
            const depClassName: string =
              typeof depNode === 'string'
                ? depNode
                : (depNode?.name ?? depNode?.type === 'Identifier')
                  ? depNode.name
                  : sourceCode.slice(depNode?.start ?? 0, depNode?.end ?? 0);
            const registryEntry = registry?.get(depClassName);

            // Tuple barrel: `imports: [HlmSelectImports]` where the
            // const is `[HlmSelect, HlmSelectContent, ...] as const`.
            // Expand into the underlying directive declarations and
            // track synthetic imports for any classes not already
            // referenced in this file.
            if (registryEntry?.kind === 'tuple' && registryEntry.members) {
              const expanded = collectExpandedImports(depClassName, new Set());
              const tupleSpecifier = importSpecifierByName.get(depClassName);
              for (const memberName of expanded) {
                const memberEntry = registry?.get(memberName);
                if (!memberEntry || memberEntry.kind === 'tuple') continue;
                const memberRef = new o.WrappedNodeExpr(
                  dependencyLocalName(memberName),
                );
                if (!importedNames.has(memberName)) {
                  const memberSpecifier = resolveSyntheticImportSpecifier(
                    fileName,
                    memberEntry,
                    tupleSpecifier,
                  );
                  if (memberSpecifier) {
                    syntheticImports.set(memberName, memberSpecifier);
                  }
                }
                const kind = memberEntry.kind === 'pipe' ? 1 : 0;
                const memberDecl: CompileDeclaration = {
                  type: memberRef,
                  selector: memberEntry.selector,
                  kind,
                  ...(kind === 1 ? { name: memberEntry.pipeName } : {}),
                };
                if (memberEntry.inputs) {
                  memberDecl.inputs = Object.values(memberEntry.inputs).map(
                    (i) => i.bindingPropertyName,
                  );
                }
                if (memberEntry.outputs) {
                  memberDecl.outputs = Object.values(
                    memberEntry.outputs,
                  ) as string[];
                }
                if (!seenDeclarationNames.has(memberName)) {
                  seenDeclarationNames.add(memberName);
                  declarations.push(memberDecl);
                }
              }
              continue;
            }

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
                  const exportedRef = new o.WrappedNodeExpr(
                    dependencyLocalName(exportedName),
                  );
                  const exportedSpecifier = resolveSyntheticImportSpecifier(
                    fileName,
                    exportedEntry,
                    moduleSpecifier,
                  );
                  if (exportedSpecifier) {
                    syntheticImports.set(exportedName, exportedSpecifier);
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
                  if (!seenDeclarationNames.has(exportedName)) {
                    seenDeclarationNames.add(exportedName);
                    declarations.push(decl);
                  }
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
            if (!seenDeclarationNames.has(depClassName)) {
              seenDeclarationNames.add(depClassName);
              declarations.push(decl);
            }
          }

          // Add self-reference so recursive components (e.g. tree views)
          // can use their own selector in their template.
          // Skip in partial mode — the linker handles self-resolution.
          if (!isPartial && !seenDeclarationNames.has(className)) {
            const selfInputs = Object.entries(sigs.inputs).map(
              ([, v]: [string, any]) => v.bindingPropertyName,
            );
            const selfOutputs = Object.values({
              ...meta.outputs,
              ...fields.outputs,
              ...sigs.outputs,
            }) as string[];
            seenDeclarationNames.add(className);
            declarations.push({
              type: classRef.value,
              selector: meta.selector,
              kind: 0,
              ...(selfInputs.length > 0 ? { inputs: selfInputs } : {}),
              ...(selfOutputs.length > 0 ? { outputs: selfOutputs } : {}),
            });
          }

          // Non-standalone components get their directive/pipe scope from the
          // @NgModule that declares them. Whole-program ngtsc resolves this; a
          // per-file engine can't read the module from the component file, but the
          // project-wide registry (populated at buildStart) records every module's
          // declarations + imports. We resolve the owning module's transitive scope
          // here and inline it into the component's own `dependencies` — matching
          // ngtsc, and surviving tree-shaking (unlike a separate, droppable
          // `ɵɵsetComponentScope` call).
          //
          // A component declared in an @NgModule must set
          // `standalone: false`, so only those need the owning-module lookup.
          if (!isPartial && meta.standalone === false && registry) {
            let owningModule:
              | { declarations?: string[]; imports?: string[] }
              | undefined;
            for (const entry of registry.values()) {
              if (
                entry.kind === 'ngmodule' &&
                entry.declarations?.includes(className)
              ) {
                owningModule = entry;
                break;
              }
            }
            if (owningModule) {
              // Transitive scope = the module's own declarations + the exported
              // declarations of every imported module (recursively) + tuple members.
              const scopeNames = new Set<string>();
              const addExportsOf = (modName: string, visited: Set<string>) => {
                if (visited.has(modName)) return;
                visited.add(modName);
                const e = registry.get(modName);
                if (!e) return;
                if (e.kind === 'ngmodule') {
                  for (const exp of e.exports ?? []) addExportsOf(exp, visited);
                } else if (e.kind === 'tuple') {
                  for (const m of e.members ?? []) scopeNames.add(m);
                } else {
                  scopeNames.add(modName);
                }
              };
              for (const d of owningModule.declarations ?? [])
                scopeNames.add(d);
              for (const imp of owningModule.imports ?? [])
                addExportsOf(imp, new Set());

              for (const name of scopeNames) {
                if (seenDeclarationNames.has(name)) continue;
                const entry = registry.get(name);
                if (
                  !entry ||
                  entry.kind === 'ngmodule' ||
                  entry.kind === 'tuple'
                )
                  continue;
                if (!importedNames.has(name)) {
                  const spec = resolveSyntheticImportSpecifier(
                    fileName,
                    entry,
                    importSpecifierByName.get(name),
                  );
                  if (spec) syntheticImports.set(name, spec);
                }
                const kind = entry.kind === 'pipe' ? 1 : 0;
                const decl: CompileDeclaration = {
                  type: new o.WrappedNodeExpr(dependencyLocalName(name)),
                  selector: entry.selector || `_unresolved-${name}`,
                  kind,
                  ...(kind === 1 ? { name: entry.pipeName } : {}),
                };
                if (entry.inputs) {
                  decl.inputs = Object.values(entry.inputs).map(
                    (i) => i.bindingPropertyName,
                  );
                }
                if (entry.outputs) {
                  decl.outputs = Object.values(entry.outputs) as string[];
                }
                seenDeclarationNames.add(name);
                declarations.push(decl);
              }
            }
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
                `[fast-compile] Could not read template file "${meta.templateUrl}" for ${className}`,
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
                  `[fast-compile] Could not read style file "${url}" for ${className}`,
                );
              }
            }
          }

          const styleRange = styleRanges?.get(dec);
          if (resolvedInlineStyles && styleRange) {
            for (let k = 0; k < styleRange.count; k++) {
              const css = resolvedInlineStyles.get(styleRange.start + k);
              if (css !== undefined) meta.styles[k] = css;
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
              `[fast-compile] Template parse error in ${fileName} (${className}): ${firstError.msg}`,
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
            providers: providersToExpr(meta.providers),
            viewProviders: providersToExpr(meta.viewProviders),
            animations: meta.animations?.length
              ? new o.LiteralArrayExpr(meta.animations)
              : null,
            isStandalone: meta.standalone,
            imports: meta.imports,
            lifecycle: { usesOnChanges: false },
            // Angular v19/v20's `createComponentDefinitionMap` reads
            // `meta.interpolation.start` and `meta.interpolation.end`
            // unconditionally (the `!== DEFAULT_INTERPOLATION_CONFIG` check
            // is reference-equality, so a missing field enters the block
            // and crashes with `Cannot read properties of undefined`). v21
            // dropped the field from `createComponentDefinitionMap`
            // entirely. Use the v19/v20 singleton when the Angular package
            // exports it (matches the reference-equality check, skipping
            // the partial-mode emission block) and fall back to a plain
            // shape on v21+ where the field is ignored anyway.
            interpolation: (
              o as {
                DEFAULT_INTERPOLATION_CONFIG?: { start: string; end: string };
              }
            ).DEFAULT_INTERPOLATION_CONFIG ?? { start: '{{', end: '}}' },
            usesInheritance,
            defer: {
              mode: 0,
              blocks: buildDeferDependencyMap(
                parsedTemplate,
                oxcProgram,
                registry,
                localSelectors,
              ).blocks,
            },
            declarationListEmitMode: 1,
            i18nUseExternalIds: opts.i18nUseExternalIds ?? false,
            relativeContextFilePath: fileName,
            controlCreate: null,
            hasDirectiveDependencies:
              declarations.length > 0 ||
              (Array.isArray(meta.imports) && meta.imports.length > 0),
          };

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
            ivyCode.push(
              `static ɵcmp = /*@__PURE__*/ ${emitAngularExpr(cmp.expression)}`,
            );
          } else {
            const cmp = compileComponentFromMetadata(
              componentMeta,
              constantPool,
              bindingParser!,
            );
            ivyCode.push(
              `static ɵcmp = /*@__PURE__*/ ${emitAngularExpr(cmp.expression)}`,
            );
          }
          break;
        }

        case 'Directive': {
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
            // `providersToExpr` lowers an inline array literal to a
            // LiteralArrayExpr (matching the Component branch) and passes a
            // const/spread reference through by value — returning `null`
            // when there are no providers so Angular skips the feature
            // entirely. Passing the bare JS array would otherwise be lowered
            // to `null` and crash Angular at runtime in `resolveProvider`.
            providers: providersToExpr(meta.providers),
            exportAs: meta.exportAs,
            isStandalone: meta.standalone,
            lifecycle: { usesOnChanges: false },
            usesInheritance,
            controlCreate: null,
          };
          if (isPartial) {
            const dir = compileDeclareDirectiveFromMetadata(directiveMeta);
            ivyCode.push(
              `static ɵdir = /*@__PURE__*/ ${emitAngularExpr(dir.expression)}`,
            );
          } else {
            const dir = compileDirectiveFromMetadata(
              directiveMeta,
              constantPool,
              bindingParser!,
            );
            ivyCode.push(
              `static ɵdir = /*@__PURE__*/ ${emitAngularExpr(dir.expression)}`,
            );
          }
          break;
        }

        case 'Pipe': {
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
            ivyCode.push(
              `static ɵpipe = /*@__PURE__*/ ${emitAngularExpr(pipe.expression)}`,
            );
          } else {
            const pipe = compilePipeFromMetadata(pipeMeta);
            ivyCode.push(
              `static ɵpipe = /*@__PURE__*/ ${emitAngularExpr(pipe.expression)}`,
            );
          }
          break;
        }

        case 'Injectable': {
          targetType = FactoryTarget.Injectable;
          const injectableMeta: any = {
            name: className,
            type: classRef,
            typeArgumentCount: 0,
            providedIn: {
              expression: new o.LiteralExpr(meta.providedIn ?? null),
              forwardRef: 0,
            },
          };
          // Forward provider configuration so `ɵprov` honors useFactory/
          // useClass/useExisting/useValue. Without this, an
          // `@Injectable({ useFactory: () => ... })` quietly falls back
          // to constructor instantiation.
          if (meta.useClass) injectableMeta.useClass = meta.useClass;
          if (meta.useFactory) injectableMeta.useFactory = meta.useFactory;
          if (meta.useExisting) injectableMeta.useExisting = meta.useExisting;
          if (meta.useValue) injectableMeta.useValue = meta.useValue;
          // Dependency list for `useFactory` / `useClass`; without it the
          // emitted factory is invoked with no arguments.
          if (meta.deps) injectableMeta.deps = meta.deps;
          if (isPartial) {
            const inj = compileDeclareInjectableFromMetadata(injectableMeta);
            ivyCode.push(
              `static ɵprov = /*@__PURE__*/ ${emitAngularExpr(inj.expression)}`,
            );
          } else {
            const inj = o.compileInjectable(injectableMeta, true);
            ivyCode.push(
              `static ɵprov = /*@__PURE__*/ ${emitAngularExpr(inj.expression)}`,
            );
          }
          break;
        }

        case 'Service': {
          // `@Service` (and the `compileService` compiler API) landed in
          // Angular 22. On older peers the decorator does not exist; fail
          // loudly rather than falling through and emitting a default
          // `Injectable`-target factory with no `ɵprov`.
          if (!angularVersionAtLeast(22)) {
            classCompileError = new Error(
              `[fast-compile] @Service on ${className} requires Angular 22 or later`,
            );
            break;
          }
          targetType = (FactoryTarget as any).Service;
          const serviceMeta: any = {
            name: className,
            type: classRef,
            typeArgumentCount: 0,
          };
          if (meta.autoProvided === false) serviceMeta.autoProvided = false;
          if (meta.factory) serviceMeta.factory = meta.factory;
          if (isPartial) {
            const svc = (o as any).compileDeclareServiceFromMetadata(
              serviceMeta,
            );
            ivyCode.push(
              `static ɵprov = /*@__PURE__*/ ${emitAngularExpr(svc.expression)}`,
            );
          } else {
            const svc = (o as any).compileService(serviceMeta, false);
            ivyCode.push(
              `static ɵprov = /*@__PURE__*/ ${emitAngularExpr(svc.expression)}`,
            );
          }
          break;
        }

        case 'NgModule': {
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
            providers: providersToExpr(meta.providers),
            imports: ngModuleImports.map((e: o.WrappedNodeExpr<any>) => e),
          };
          if (isPartial) {
            const ngMod = compileDeclareNgModuleFromMetadata(ngModuleMeta);
            ivyCode.push(
              `static ɵmod = /*@__PURE__*/ ${emitAngularExpr(ngMod.expression)}`,
            );
            const injector = compileDeclareInjectorFromMetadata(injectorMeta);
            ivyCode.push(
              `static ɵinj = /*@__PURE__*/ ${emitAngularExpr(injector.expression)}`,
            );
          } else {
            const ngMod = compileNgModule(ngModuleMeta);
            ivyCode.push(
              `static ɵmod = /*@__PURE__*/ ${emitAngularExpr(ngMod.expression)}`,
            );
            const injector = compileInjector(injectorMeta);
            ivyCode.push(
              `static ɵinj = /*@__PURE__*/ ${emitAngularExpr(injector.expression)}`,
            );
          }
          break;
        }
      }
    });

    if (classCompileError) {
      throw classCompileError;
    }

    // Generate factory
    const deps = extractConstructorDeps(node, sourceCode, typeOnlyImports);
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
        ivyCode.unshift(
          `static ɵfac = /*@__PURE__*/ ${emitAngularExpr(fac.expression)}`,
        );
      } else {
        const fac = compileFactoryFunction(factoryMeta);
        ivyCode.unshift(
          `static ɵfac = /*@__PURE__*/ ${emitAngularExpr(fac.expression)}`,
        );
      }
    }

    // Emit setClassMetadata for runtime decorator reflection (devMode only)
    const ctorParameters = buildCtorParameters(
      node,
      sourceCode,
      typeOnlyImports,
    );
    const propDecorators = buildPropDecorators(node, sourceCode, 'i0.');
    const scopedMetadata: o.Statement[] = [];
    angularDecorators.forEach((dec) => {
      const decName = decoratorCallName(dec, sourceCode)!;
      const decArgsNode = dec.expression.arguments[0];
      const textOf = (n: any) => sourceCode.slice(n.start, n.end);

      // Build the decorator args for setClassMetadata, inlining resources if needed.
      const resources = resolvedResources.get(dec);
      let metadataArgsExpr: string | null = null;
      if (decArgsNode) {
        if (resources && decArgsNode.type === 'ObjectExpression') {
          // Inline external templateUrl/styleUrl(s) into the metadata so Angular's
          // runtime doesn't try to fetch relative URLs (which fails during SSR).
          const rewrittenProps: string[] = [];
          let needsTransform = false;
          for (const prop of decArgsNode.properties) {
            if (
              prop.type !== 'Property' ||
              prop.shorthand ||
              prop.method ||
              prop.kind !== 'init'
            ) {
              rewrittenProps.push(textOf(prop));
              continue;
            }
            const propName = textOf(prop.key);

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
              rewrittenProps.push(textOf(prop));
            }
          }
          metadataArgsExpr = needsTransform
            ? `{${rewrittenProps.join(', ')}}`
            : textOf(decArgsNode);
        } else {
          metadataArgsExpr = textOf(decArgsNode);
        }
      }

      try {
        // `LiteralMapPropertyAssignment` was a class with a constructor in
        // Angular up through ~v19, removed-then-restored in later v20/v21
        // patches. The only stable shape across versions is the plain
        // `{ key, value, quoted }` object literal — Angular's own emitter
        // and Analog's `JSEmitter` both consume entries via duck typing
        // (`.key` / `.value` / `.quoted`), and `compileClassMetadata` does
        // not `instanceof`-check entries. The js-emitter has a matching
        // comment at the consumption site. Using `new o.LiteralMapProperty
        // Assignment(...)` would throw "is not a constructor" on Angular
        // versions where the class export is missing (e.g. 20.3.x), and
        // the surrounding try/catch would silently disable class metadata
        // emission for every class in the project.
        const classMetaInput = {
          type: new o.WrappedNodeExpr(className),
          decorators: new o.LiteralArrayExpr([
            new o.LiteralMapExpr([
              {
                key: 'type',
                value: new o.WrappedNodeExpr(decName),
                quoted: false,
              },
              ...(metadataArgsExpr
                ? [
                    {
                      key: 'args',
                      value: new o.LiteralArrayExpr([
                        new o.WrappedNodeExpr(metadataArgsExpr),
                      ]),
                      quoted: false,
                    },
                  ]
                : []),
            ] as unknown as o.LiteralMapPropertyAssignment[]),
          ]),
          ctorParameters: ctorParameters
            ? new o.WrappedNodeExpr(`() => [${ctorParameters}]`)
            : null,
          propDecorators: propDecorators
            ? new o.WrappedNodeExpr(propDecorators)
            : null,
        };
        const classMetadataExpr = isPartial
          ? compileDeclareClassMetadata(classMetaInput)
          : compileClassMetadata(classMetaInput);
        const metadataStmt = new o.ExpressionStatement(classMetadataExpr);
        if (topLevelClasses.has(node)) {
          constantPool.statements.push(metadataStmt);
        } else {
          scopedMetadata.push(metadataStmt);
        }
      } catch (e) {
        // Skip if compileClassMetadata fails — surfaced via DEBUG=analog-fast-compile
        if (debugCompile.enabled) {
          debugCompile(
            'compileClassMetadata failed for %s in %s: %s',
            className,
            fileName,
            (e as Error)?.message,
          );
        }
      }
    });

    // Collect member decorators (@HostListener, @HostBinding, @Input, @Output,
    // @ViewChild, @ContentChild, etc.) so they are removed from the source.
    // The metadata has already been extracted by detectFieldDecorators().
    const memberDecorators: any[] = [];
    for (const member of node.body.body) {
      for (const dec of member.decorators ?? []) {
        if (FIELD_DECORATORS.has(decoratorCallName(dec, sourceCode) ?? '')) {
          memberDecorators.push(dec);
        }
      }
    }

    classResults.push({
      ivyCode,
      decorators: [...angularDecorators, ...memberDecorators],
      classEnd: node.end,
      scopedMetadata,
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
    const localName = dependencyLocalName(name);
    if (!importedNames.has(localName)) {
      const binding = localName === name ? name : `${name} as ${localName}`;
      ms.prepend(`import { ${binding} } from "${specifier}";\n`);
      importedNames.add(localName);
    }
  }

  // 2a. Hoist non-exported variable/function declarations that appear after
  // a class to just before the first class. This avoids TDZ errors when
  // static ɵcmp references file-level constants declared after the class.
  //
  // We must NOT hoist a statement whose initializer references a name
  // (class, exported const/let) that is defined between firstClassPos and
  // the statement itself — doing so would move the reference before the
  // definition and cause a TDZ error at runtime.
  if (classResults.length > 0) {
    // Find the position right before the first class (any class, not just Angular-decorated)
    const statements = (oxcProgram.body as any[]).map(toTopLevelStatement);
    let firstClassPos = Infinity;
    const nonHoistableNames = new Set<string>();
    for (const { decl, start } of statements) {
      if (decl.type === 'ClassDeclaration') {
        firstClassPos = start;
        // The first class itself is non-hoistable — statements hoisted
        // before it must not reference it.
        if (decl.id) {
          nonHoistableNames.add(decl.id.name);
        }
        break;
      }
    }

    // Pass 1: collect names defined by statements that will NOT be hoisted
    // (classes, enums, exported vars/functions) and therefore remain after
    // firstClassPos.
    for (const { decl, exported, start } of statements) {
      if (start <= firstClassPos) continue;

      if (
        decl.type === 'ClassDeclaration' ||
        decl.type === 'TSEnumDeclaration'
      ) {
        if (decl.id) nonHoistableNames.add(decl.id.name);
      } else if (
        exported &&
        (decl.type === 'VariableDeclaration' ||
          decl.type === 'FunctionDeclaration')
      ) {
        for (const n of getDefinedNames(decl)) {
          nonHoistableNames.add(n);
        }
      }
    }

    // Pass 2: for each hoist candidate, check if it references any
    // non-hoistable name. If it does, skip it and add its own names to the
    // non-hoistable set (transitivity).
    for (const { decl, exported, start, end } of statements) {
      if (start <= firstClassPos) continue;

      const isCandidate =
        !exported &&
        (decl.type === 'VariableDeclaration' ||
          decl.type === 'FunctionDeclaration');
      if (!isCandidate) continue;

      const referencedIds = collectIdentifiers(decl);
      let referencesNonHoistable = false;
      for (const id of referencedIds) {
        if (nonHoistableNames.has(id)) {
          referencesNonHoistable = true;
          break;
        }
      }

      if (referencesNonHoistable) {
        // Don't hoist — mark this statement's names as non-hoistable too
        for (const name of getDefinedNames(decl)) {
          nonHoistableNames.add(name);
        }
      } else {
        // Move rather than re-insert so the statement keeps its source map.
        // The separating newline is attached to the moved chunk.
        ms.appendLeft(end, '\n');
        ms.move(start, end, firstClassPos);
      }
    }
  }

  // 2. For each compiled class: remove decorators + insert Ivy definitions
  for (const cr of classResults) {
    // Remove Angular decorators from source
    for (const dec of cr.decorators) {
      const start = dec.start;
      const end = dec.end;
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

    for (const stmt of cr.scopedMetadata) {
      ms.appendLeft(cr.classEnd, `\n/*@__PURE__*/ ${emitAngularStmt(stmt)}`);
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
      // setClassMetadata is wrapped in `(() => { ... })()` — annotate
      // the IIFE call so bundlers can drop it when ngDevMode is folded
      // to false at production build time.
      sideEffects.push(`/*@__PURE__*/ ${code}`);
    } else {
      helpers.push(code);
    }
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
  //    Detection runs once on the final output; helpers are appended for
  //    analysis only, since their position does not affect references.
  const helperCode = helpers.join('\n');
  const willElide = detectTypeOnlyImportNames(
    ms.toString() + '\n' + helperCode,
  );
  if (helpers.length > 0) {
    // Insert helpers after the last import / top-level non-class statement,
    // well before any class that references them. Skip imports that will be
    // fully removed by type elision (step 5): inserting inside a
    // soon-to-be-removed range would discard the helpers with the import.
    let insertPos = 0;
    for (const stmt of oxcProgram.body as any[]) {
      const { decl } = toTopLevelStatement(stmt);
      if (stmt.type === 'ImportDeclaration') {
        // Skip imports that will be entirely removed by type elision
        if (willElide.size > 0 && stmt.specifiers.length > 0) {
          const allElided = stmt.specifiers.every(
            (spec: any) =>
              spec.type === 'ImportNamespaceSpecifier' ||
              spec.importKind === 'type' ||
              willElide.has(spec.local.name),
          );
          if (allElided) continue;
        }
        insertPos = stmt.end;
      } else if (
        decl.type === 'VariableDeclaration' &&
        !sourceCode.slice(stmt.start, stmt.end).includes('class')
      ) {
        insertPos = stmt.end;
      } else if (
        stmt.type !== 'TSExportAssignment' &&
        !(
          stmt.type === 'ExportDefaultDeclaration' &&
          decl.type !== 'ClassDeclaration' &&
          decl.type !== 'FunctionDeclaration'
        )
      ) {
        // Stop at the first class or non-import/non-variable statement
        break;
      }
    }
    // Helpers must survive downstream `ms.overwrite()` / `ms.remove()` of
    // imports performed by the type-only specifier elision pass (step 5).
    //
    // Case `insertPos > 0`: a surviving import ends at `insertPos`. Use
    // `appendRight(insertPos, …)` so helpers bind to the `\n` after the
    // import's `;` — outside any overwrite range `[node.start, node.end)`
    // of a preceding import. `appendLeft(insertPos, …)` would bind to the
    // `;` itself, which IS inside the overwrite range and would be wiped.
    //
    // Case `insertPos === 0`: no import survives — every import is going
    // to be elided, and `elideTypeOnlyImportsMagicString` will
    // `ms.remove(0, declEnd)` the first one. `appendRight(0, …)` anchors
    // to the character at position 0 (the first import's first char),
    // which is inside `[0, declEnd)` and gets wiped. Use `appendLeft(0, …)`
    // instead — it anchors to the LEFT of position 0, outside any range
    // starting at 0, so the helpers survive. Ordering is still correct
    // because the i0 import prepended in step 1 lives in MagicString's
    // `intro` (from `ms.prepend`), which always emits before any
    // `appendLeft` content at position 0.
    if (insertPos === 0) {
      ms.appendLeft(0, helperCode + '\n');
    } else {
      ms.appendRight(insertPos, '\n' + helperCode + '\n');
    }
  }
  elideTypeOnlyImportsMagicString(ms, oxcProgram, willElide);

  const map = ms.generateMap({
    source: fileName,
    file: fileName + '.js',
    includeContent: true,
    hires: 'boundary',
  });

  if (debugCompile.enabled) {
    debugCompile(
      'compile %s done (%dms, %d classes, %d resource deps)',
      fileName,
      Math.round(performance.now() - startTimeMs),
      classResults.length,
      resourceDependencies.length,
    );
  }
  return {
    code: ms.toString(),
    map,
    resourceDependencies,
  };
}
