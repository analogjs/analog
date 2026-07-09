// Analog Server Functions (issue #2422) — shared, client-safe type surface.
// These types are imported by both the client entry (`injectServerFn`) and the
// server entry (`serverFn`/`dispatchServerFn`), so they live in the primary,
// client-safe `@analogjs/router` entry and carry no runtime code.

/** Minimal Standard Schema shape (valibot/zod/arktype conform). */
export interface StandardSchemaV1<In = unknown> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    validate: (
      value: unknown,
    ) =>
      | { value: In; issues?: undefined }
      | { issues: ReadonlyArray<{ message: string }> }
      | Promise<
          | { value: In; issues?: undefined }
          | { issues: ReadonlyArray<{ message: string }> }
        >;
  };
}

export type ServerFnMethod = 'GET' | 'POST';

export interface ServerFnConfig<In> {
  /**
   * Opaque route id `/_analog/fn/<id>`. **Build-injected, not author-supplied:**
   * the Analog transform derives `hash(fileId + exportName)` and stamps it into
   * both the server registration and the client proxy, so authors never choose a
   * route. Absent at runtime means the transform did not run — `serverFn` throws.
   */
  id?: string;
  /** Defaults to 'POST' when `input` is present, otherwise 'GET'. */
  method?: ServerFnMethod;
  input?: StandardSchemaV1<In>;
}

/**
 * Interceptor-accumulated context, delivered to the handler as its second
 * argument. Apps extend this by declaration merging.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ServerFnContext {}

/** A server function reference: callable type on both sides; real impl only on the server. */
export type ServerFn<In, Out> = ((input: In) => Promise<Out>) & {
  readonly __serverFn: true;
  readonly id: string;
  readonly url: string;
  readonly method: ServerFnMethod;
};

export type ServerFnHandler<In, Out> = (
  input: In,
  context: ServerFnContext,
) => Promise<Out> | Out;

export interface ServerFnDef {
  id: string;
  method: ServerFnMethod;
  config: ServerFnConfig<unknown>;
  handler: ServerFnHandler<unknown, unknown>;
}
