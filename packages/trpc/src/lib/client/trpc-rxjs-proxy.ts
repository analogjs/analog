import type {
  AnyProcedure,
  AnyRouter,
  inferClientTypes,
  inferProcedureInput,
  inferTransformedProcedureOutput,
  IntersectionError,
  ProcedureCallOptions,
  ProcedureType,
  RouterRecord,
} from '@trpc/server/unstable-core-do-not-import';
import {
  createFlatProxy,
  createRecursiveProxy,
} from '@trpc/server/unstable-core-do-not-import';
import {
  inferObservableValue,
  share,
  Observable as TrpcObservable,
} from '@trpc/server/observable';
import { Observable as RxJSObservable } from 'rxjs';
import {
  TRPCClientError,
  OperationContext,
  OperationLink,
  TRPCClientRuntime,
  CreateTRPCClientOptions,
} from '@trpc/client';
import { createChain, TRPCRequestOptions, TRPCType } from './shared-internal';

// Type definitions based on ngx-trpc approach
type ResolverDef = {
  input: any;
  output: any;
  transformer: boolean;
  errorShape: any;
};

type Resolver<TDef extends ResolverDef> = (
  input: TDef['input'],
  opts?: ProcedureCallOptions<unknown>,
) => RxJSObservable<TDef['output']>;

type DecorateProcedure<
  TType extends ProcedureType,
  TDef extends ResolverDef,
> = TType extends 'query'
  ? {
      query: Resolver<TDef>;
    }
  : TType extends 'mutation'
    ? {
        mutate: Resolver<TDef>;
      }
    : never;

/**
 * @internal
 */
type DecoratedProcedureRecord<
  TRouter extends AnyRouter,
  TRecord extends RouterRecord,
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends RouterRecord
      ? DecoratedProcedureRecord<TRouter, $Value>
      : $Value extends AnyProcedure
        ? DecorateProcedure<
            $Value['_def']['type'],
            {
              input: inferProcedureInput<$Value>;
              output: inferTransformedProcedureOutput<
                inferClientTypes<TRouter>,
                $Value
              >;
              errorShape: inferClientTypes<TRouter>['errorShape'];
              transformer: inferClientTypes<TRouter>['transformer'];
            }
          >
        : never
    : never;
};

const clientCallTypeMap: Record<
  keyof DecorateProcedure<any, any>,
  ProcedureType
> = {
  query: 'query',
  mutate: 'mutation',
};

// Removed subscription and requestAsPromise
type UntypedClientProperties =
  | 'links'
  | 'runtime'
  | 'requestId'
  | '$request'
  | 'query'
  | 'mutation';

/**
 * @public
 **/
export type inferRouterClient<TRouter extends AnyRouter> =
  DecoratedProcedureRecord<TRouter, TRouter['_def']['record']>;

/**
 * Creates a proxy client and shows type errors if you have query names that collide with built-in properties
 */
export type CreateTrpcProxyClient<TRouter extends AnyRouter> =
  inferRouterClient<TRouter> extends infer $Value
    ? UntypedClientProperties & keyof $Value extends never
      ? inferRouterClient<TRouter>
      : IntersectionError<UntypedClientProperties & keyof $Value>
    : never;

/** @internal */
export const clientCallTypeToProcedureType = (
  clientCallType: string,
): ProcedureType => {
  return clientCallTypeMap[clientCallType as keyof typeof clientCallTypeMap];
};

export function createTRPCRxJSProxyClient<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
) {
  const client = new TRPCClient<TRouter>(opts);
  return createTRPCRxJSClientProxy(client as TRPCClient<TRouter>);
}

function createTRPCRxJSClientProxy<TRouter extends AnyRouter>(
  client: TRPCClient<TRouter>,
): CreateTrpcProxyClient<TRouter> {
  const proxy = createRecursiveProxy<CreateTrpcProxyClient<TRouter>>(
    ({ path, args }) => {
      const pathCopy = [...path];
      const procedureType = clientCallTypeToProcedureType(pathCopy.pop()!);

      const fullPath = pathCopy.join('.');

      return (client as any)[procedureType](fullPath, ...args);
    },
  );
  return createFlatProxy<CreateTrpcProxyClient<TRouter>>((key) => {
    if (client.hasOwnProperty(key)) {
      return (client as any)[key as any];
    }
    if (key === '__untypedClient') {
      return client;
    }
    return proxy[key];
  });
}

/**
 * Removed subscription method;
 * Remove converting trpc observables to promises and therefore also the AbortController
 * Add converting to rxjs observable
 */
class TRPCClient<TRouter extends AnyRouter> {
  private readonly links: OperationLink<TRouter>[];
  public readonly runtime: TRPCClientRuntime;
  private requestId: number;

  constructor(opts: CreateTRPCClientOptions<TRouter>) {
    this.requestId = 0;

    // tRPC v11 doesn't need a default transformer in runtime
    this.runtime = {} as TRPCClientRuntime;

    // Initialize the links
    this.links = opts.links.map((link) => link(this.runtime));
  }

  private $request<TInput = unknown, TOutput = unknown>({
    type,
    input,
    path,
    context = {},
  }: {
    type: TRPCType;
    input: TInput;
    path: string;
    context?: OperationContext;
  }) {
    const chain$ = createChain<AnyRouter, TInput, TOutput>({
      links: this.links as OperationLink<any, any, any>[],
      op: {
        id: ++this.requestId,
        type,
        path,
        input,
        context,
        signal: null,
      },
    });
    type TValue = inferObservableValue<typeof chain$>;
    return trpcObservableToRxJsObservable<TValue>(chain$.pipe(share()));
  }

  public query(path: string, input?: unknown, opts?: TRPCRequestOptions) {
    return this.$request<unknown, unknown>({
      type: 'query',
      path,
      input: input,
      context: opts?.context,
    });
  }

  public mutation(path: string, input?: unknown, opts?: TRPCRequestOptions) {
    return this.$request<unknown, unknown>({
      type: 'mutation',
      path,
      input: input,
      context: opts?.context,
    });
  }
}

function trpcObservableToRxJsObservable<TValue>(
  observable: TrpcObservable<TValue, unknown>,
) {
  return new RxJSObservable<TValue>((subscriber) => {
    const sub = observable.subscribe({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      next: (value) => subscriber.next((value.result as any).data),
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      error: (err) => subscriber.error(TRPCClientError.from(err)),
      complete: () => subscriber.complete(),
    });
    return () => {
      sub.unsubscribe();
    };
  });
}
