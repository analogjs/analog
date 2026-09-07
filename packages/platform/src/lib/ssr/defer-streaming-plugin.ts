import type { Plugin } from 'vite';
import { parseSync, type Argument, type Statement } from 'oxc-parser';

/** Minimum Angular major qualified for streaming; the actual runtime shape is checked below. */
export const MIN_STREAMING_ANGULAR_MAJOR = 21;

/**
 * Whether the streaming SSR patch can be applied to the installed Angular.
 * A `null` major (version undetectable) returns `true`: don't block on a failed
 * detection — the plugin's anchor-drift detection catches a real mismatch at
 * build time and falls back to buffered rendering.
 */
export function streamingSupportedOnAngular(major: number | null): boolean {
  return major === null || major >= MIN_STREAMING_ANGULAR_MAJOR;
}

type DeferAnalysis =
  | { kind: 'not-target' }
  | { kind: 'patchable'; offset: number }
  | { kind: 'drifted'; reason: string };

function analyzeDeferRuntime(code: string): DeferAnalysis {
  if (!code.includes('function applyDeferBlockState('))
    return { kind: 'not-target' };
  const parsed = parseSync('angular-core.mjs', code);
  if (parsed.errors.length)
    return { kind: 'drifted', reason: 'invalid Angular core JavaScript' };
  const fn = parsed.program.body.find(
    (node) =>
      node.type === 'FunctionDeclaration' &&
      node.id?.name === 'applyDeferBlockState',
  );
  if (!fn || fn.type !== 'FunctionDeclaration' || !fn.body)
    return { kind: 'not-target' };
  const names = fn.params
    .map((param) => (param.type === 'Identifier' ? param.name : ''))
    .join(',');
  if (names !== 'newState,lDetails,lContainer,tNode,hostLView')
    return {
      kind: 'drifted',
      reason: 'changed applyDeferBlockState parameters',
    };
  const collector = parsed.program.body.some(
    (node) =>
      node.type === 'FunctionDeclaration' &&
      node.id?.name === 'collectNativeNodesInLContainer',
  );
  if (!collector)
    return {
      kind: 'drifted',
      reason: 'missing collectNativeNodesInLContainer',
    };
  const offset = profilerEndOffset(fn.body.body[fn.body.body.length - 1]);
  return offset === undefined
    ? { kind: 'drifted', reason: 'missing DeferBlockStateEnd profiler anchor' }
    : { kind: 'patchable', offset };
}

function profilerEndOffset(
  statement: Statement | undefined,
): number | undefined {
  if (
    statement?.type !== 'ExpressionStatement' ||
    statement.expression.type !== 'CallExpression'
  )
    return;
  const call = statement.expression;
  if (
    call.callee.type !== 'Identifier' ||
    call.callee.name !== 'profiler' ||
    call.arguments.length !== 1
  )
    return;
  return isEndEvent(call.arguments[0]) ? statement.start : undefined;
}

function isEndEvent(event: Argument | undefined): boolean {
  if (event?.type === 'Literal') return typeof event.value === 'number';
  return (
    event?.type === 'MemberExpression' &&
    !event.computed &&
    event.object.type === 'Identifier' &&
    event.object.name === 'ProfilerEvent' &&
    event.property.type === 'Identifier' &&
    event.property.name === 'DeferBlockStateEnd'
  );
}

function patchDeferRuntime(code: string, offset: number): string {
  if (code.includes('globalThis.__analogSsrDeferCapture({')) return code;
  const capture =
    `try { if (newState === DeferBlockState.Complete && ` +
    `typeof ngServerMode !== 'undefined' && ngServerMode && ` +
    `typeof globalThis.__analogSsrDeferCapture === 'function') { ` +
    `globalThis.__analogSsrDeferCapture({ ssrUniqueId: lDetails[SSR_UNIQUE_ID], lContainer, hostLView }); } } catch (e) {}\n  `;
  return (
    code.slice(0, offset) +
    capture +
    code.slice(offset) +
    '\nglobalThis.__analogSsrInternals = Object.assign(globalThis.__analogSsrInternals || {}, { collectNativeNodesInLContainer });\n'
  );
}

/** Inject capture before the named defer function's final profiler call, preserving its original source. */
export function injectDeferStreamingHook(code: string): string | null {
  const info = analyzeDeferRuntime(code);
  return info.kind === 'patchable'
    ? patchDeferRuntime(code, info.offset)
    : null;
}

/** Inspect the named function's final profiler call without depending on enum ordinals. */
export function inspectAngularCoreModule(
  code: string,
):
  | { kind: 'not-target' }
  | { kind: 'patchable' }
  | { kind: 'drifted'; reason: string } {
  const info = analyzeDeferRuntime(code);
  return info.kind === 'patchable' ? { kind: 'patchable' } : info;
}

/**
 * Vite plugin that applies {@link injectDeferStreamingHook} to `@angular/core`
 * during SSR builds, so `@analogjs/router`'s `renderStream` can flush `@defer`
 * blocks as they resolve on the server — without hand-patching node_modules.
 *
 * Only active for SSR. Mirrors the enforce/filter/ssr-gate shape of
 * `i18nDefRegistryPlugin`. If the `@defer` runtime module is found but its
 * anchors have drifted (Angular changed internals), or if it is never
 * encountered at all, the plugin warns rather than silently producing a build
 * that falls back to buffered rendering.
 */
export function deferStreamingPlugin(): Plugin {
  const applied = new Set<string>();
  const warnedDrift = new Set<string>();
  return {
    name: 'analogjs-defer-streaming',
    enforce: 'post',
    config() {
      return {
        ssr: { noExternal: ['@angular/core'] },
        environments: { ssr: { optimizeDeps: { exclude: ['@angular/core'] } } },
      };
    },
    transform: {
      filter: {
        id: /\/@angular\/core\//,
      },
      handler(code, _id, options) {
        if (!options?.ssr) return;
        const info = analyzeDeferRuntime(code);
        if (info.kind === 'not-target') return;
        if (info.kind === 'drifted') {
          if (!warnedDrift.has(this.environment.name)) {
            warnedDrift.add(this.environment.name);
            this.warn(
              `experimental streaming SSR: found @angular/core's @defer runtime ` +
                `but could not apply the resolution hook (${info.reason}). The ` +
                `installed Angular version likely changed internals the patch ` +
                `depends on; streaming will fall back to buffered rendering.`,
            );
          }
          return;
        }
        const out = patchDeferRuntime(code, info.offset);
        applied.add(this.environment.name);
        return { code: out };
      },
    },
    buildEnd() {
      // Require coverage from the SSR service. A later Nitro rebundle may
      // also encounter Angular modules imported by endpoint handlers.
      if (this.environment.name !== 'ssr') return;
      if (
        !applied.has(this.environment.name) &&
        !warnedDrift.has(this.environment.name)
      ) {
        this.warn(
          `experimental streaming SSR is enabled but @angular/core's @defer ` +
            `runtime module was never encountered during the SSR build, so the ` +
            `resolution hook was not injected. Streaming will fall back to ` +
            `buffered rendering.`,
        );
      }
    },
  };
}
