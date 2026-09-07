export interface RegistryInput {
  classPropertyName: string;
  bindingPropertyName: string;
  isSignal: boolean;
  required: boolean;
  /**
   * `true` when the input declares a `transform` function. The actual
   * transform expression isn't usable cross-file, but downstream tools
   * (template type checking, codegen widening) need to know whether
   * one exists so they can broaden the accepted binding type.
   */
  hasTransform?: boolean;
}

export interface RegistryEntry {
  /** CSS selector for components/directives, pipe name for pipes, class name for NgModules */
  selector: string;
  /** What kind of Angular declaration this is */
  kind: 'component' | 'directive' | 'pipe' | 'ngmodule' | 'tuple';
  /** The pipe name (only for pipes) */
  pipeName?: string;
  /** Exported class names (only for NgModules) */
  exports?: string[];
  /** Declared class names (only for NgModules) — used to wire non-standalone
   * component scope from the declaring module. */
  declarations?: string[];
  /** Imported module/class names (only for NgModules) — expanded transitively
   * to compute the directive/pipe scope of declared components. */
  imports?: string[];
  /**
   * Member class names (only for `tuple` kind) — produced by top-level
   * `export const X = [A, B, C] as const` style barrels common in
   * helm/spartan-style libraries. The compiler expands these into the
   * underlying directives when they appear in another component's
   * `imports` array, mirroring how Angular's official compiler resolves
   * static `imports` references at compile time.
   */
  members?: string[];
  /** The source file this declaration was found in */
  fileName: string;
  /** The class name */
  className: string;
  /** Input bindings (from signal APIs and @Input decorators) */
  inputs?: Record<string, RegistryInput>;
  /** Output bindings (from signal APIs and @Output decorators) */
  outputs?: Record<string, string>;
  /** The package this declaration was scanned from (e.g. "@angular/cdk") */
  sourcePackage?: string;
}

/** Maps class name → registry entry */
export type ComponentRegistry = Map<string, RegistryEntry>;
