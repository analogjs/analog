import type {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRouter,
  CombinedDataTransformer,
  DataTransformerOptions,
  inferProcedureInput,
  inferProcedureOutput,
  IntersectionError,
  ProcedureArgs,
  ProcedureRouterRecord,
  ProcedureType,
} from '@trpc/server';
import {
  createFlatProxy,
  createRecursiveProxy,
  inferTransformedProcedureOutput,
} from '@trpc/server/shared';
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
} from '@trpc/client';
import {
  createChain,
  CreateTRPCClientOptions,
  TRPCRequestOptions,
  TRPCType,
} from './shared-internal';

// Changed to rxjs observable
type Resolver<TProcedure extends AnyProcedure> = (
  ...args: ProcedureArgs<TProcedure['_def']>
) => RxJSObservable<inferTransformedProcedureOutput<TProcedure>>;

// Removed subscription and using new type
type DecorateProcedure<
  TProcedure extends AnyProcedure,
  TRouter extends AnyRouter,
> = TProcedure extends AnyQueryProcedure
  ? {
      query: Resolver<TProcedure>;
    }
  : TProcedure extends AnyMutationProcedure
    ? {
        mutate: Resolver<TProcedure>;
      }
    : never;

// Removed subscription and using new type
type DecoratedProcedureRecord<
  TProcedures extends ProcedureRouterRecord,
  TRouter extends AnyRouter,
> = {
  [TKey in keyof TProcedures]: TProcedures[TKey] extends AnyRouter
    ? DecoratedProcedureRecord<
        TProcedures[TKey]['_def']['record'],
        TProcedures[TKey]
      >
    : TProcedures[TKey] extends AnyProcedure
      ? DecorateProcedure<TProcedures[TKey], TRouter>
      : never;
};

// Removed subscription and using new type
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

// Nothing changed, only using new types
export type CreateTrpcProxyClient<TRouter extends AnyRouter> =
  DecoratedProcedureRecord<
    TRouter['_def']['record'],
    TRouter
  > extends infer TProcedureRecord
    ? UntypedClientProperties & keyof TProcedureRecord extends never
      ? TProcedureRecord
      : IntersectionError<UntypedClientProperties & keyof TProcedureRecord>
    : never;

// Nothing changed, only using new types
function createTRPCRxJSClientProxy<TRouter extends AnyRouter>(
  client: TRPCClient<TRouter>,
) {
  return createFlatProxy<CreateTrpcProxyClient<TRouter>>((key) => {
    // eslint-disable-next-line no-prototype-builtins
    if (client.hasOwnProperty(key)) {
      return (client as any)[key as any];
    }
    return createRecursiveProxy(({ path, args }) => {
      const pathCopy = [key, ...path];
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const clientCallType = pathCopy.pop()! as keyof DecorateProcedure<
        any,
        any
      >;

      const procedureType = clientCallTypeMap[clientCallType];

      const fullPath = pathCopy.join('.');

      return (client as any)[procedureType](fullPath, ...args);
    });
  });
}

export function createTRPCRxJSProxyClient<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
) {
  const client = new TRPCClient<TRouter>(opts);
  const proxy = createTRPCRxJSClientProxy(client as TRPCClient<TRouter>);
  return proxy;
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

    const combinedTransformer: CombinedDataTransformer = (() => {
      const transformer = opts.transformer as
        | DataTransformerOptions
        | undefined;

      if (!transformer) {
        return {
          input: {
            serialize: (data) => data,
            deserialize: (data) => data,
          },
          output: {
            serialize: (data) => data,
            deserialize: (data) => data,
          },
        };
      }
      if ('input' in transformer) {
        return opts.transformer as CombinedDataTransformer;
      }
      return {
        input: transformer,
        output: transformer,
      };
    })();

    this.runtime = {
      transformer: {
        serialize: (data) => combinedTransformer.input.serialize(data),
        deserialize: (data) => combinedTransformer.output.deserialize(data),
      },
      combinedTransformer,
    };

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
      },
    });
    type TValue = inferObservableValue<typeof chain$>;
    return trpcObservableToRxJsObservable<TValue>(chain$.pipe(share()));
  }

  public query<
    TQueries extends TRouter['_def']['queries'],
    TPath extends string & keyof TQueries,
    TInput extends inferProcedureInput<TQueries[TPath]>,
  >(path: TPath, input?: TInput, opts?: TRPCRequestOptions) {
    type TOutput = inferProcedureOutput<TQueries[TPath]>;
    return this.$request<TInput, TOutput>({
      type: 'query',
      path,
      input: input as TInput,
      context: opts?.context,
    });
  }

  public mutation<
    TMutations extends TRouter['_def']['mutations'],
    TPath extends string & keyof TMutations,
    TInput extends inferProcedureInput<TMutations[TPath]>,
  >(path: TPath, input?: TInput, opts?: TRPCRequestOptions) {
    type TOutput = inferTransformedProcedureOutput<TMutations[TPath]>;
    return this.$request<TInput, TOutput>({
      type: 'mutation',
      path,
      input: input as TInput,
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
