import type {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRouter,
  CombinedDataTransformer,
  DataTransformerOptions,
  DefaultDataTransformer,
  inferProcedureInput,
  inferProcedureOutput,
  ProcedureArgs,
  ProcedureRouterRecord,
  ProcedureType
} from "@trpc/server";
import { ClientDataTransformerOptions } from "@trpc/server";
import { createFlatProxy, createRecursiveProxy, inferTransformedProcedureOutput } from "@trpc/server/shared";
import { inferObservableValue, observable, share } from "@trpc/server/observable";
import {
  Operation,
  OperationContext,
  OperationLink,
  OperationResultObservable,
  TRPCClientRuntime
} from "@trpc/client/src/links/types";
import { Observable as TrpcObservable } from "@trpc/server/src/observable/types";
import { Observable as RxJSObservable } from "rxjs";
import { TRPCClientError, TRPCLink } from "@trpc/client";

// Changed to rxjs observable
type Resolver<TProcedure extends AnyProcedure> = (
  ...args: ProcedureArgs<TProcedure['_def']>
) => RxJSObservable<inferTransformedProcedureOutput<TProcedure>>;

// Removed subscription
type DecorateProcedure<
  TProcedure extends AnyProcedure,
  TRouter extends AnyRouter
> = TProcedure extends AnyQueryProcedure
  ? {
      query: Resolver<TProcedure>;
    }
  : TProcedure extends AnyMutationProcedure
  ? {
      mutate: Resolver<TProcedure>;
    }
  : never;

// Removed subscription
type DecoratedProcedureRecord<
  TProcedures extends ProcedureRouterRecord,
  TRouter extends AnyRouter
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

// Removed subscription
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

// Nothing changed, only using different types
export type CreateTRPCProxyClient<TRouter extends AnyRouter> =
  DecoratedProcedureRecord<
    TRouter['_def']['record'],
    TRouter
  > extends infer TProcedureRecord
    ? UntypedClientProperties & keyof TProcedureRecord extends never
      ? TProcedureRecord
      : IntersectionError<UntypedClientProperties & keyof TProcedureRecord>
    : never;

/**
 * Nothing changed, only using different types
 */
function createTRPCRxJSClientProxy<TRouter extends AnyRouter>(
  client: TRPCClient<TRouter>
) {
  return createFlatProxy<CreateTRPCProxyClient<TRouter>>((key) => {
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
  opts: CreateTRPCClientOptions<TRouter>
) {
  const client = new TRPCClient<TRouter>(opts);
  const proxy = createTRPCRxJSClientProxy(client as TRPCClient<TRouter>);
  return proxy;
}

type TRPCType = 'query' | 'mutation';

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
    const chain$ = createChain<TRouter, TInput, TOutput>({
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
    TInput extends inferProcedureInput<TQueries[TPath]>
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
    TInput extends inferProcedureInput<TMutations[TPath]>
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
  observable: TrpcObservable<TValue, unknown>
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

/*
 * One to one copy of the trpc client internal code
 * Nothing was changed, but we can not import these methods because
 * they are not exported
 */

type IntersectionError<TKey extends string> =
  `The property '${TKey}' in your router collides with a built-in method, rename this router or procedure on your backend.`;

export interface TRPCRequestOptions {
  /**
   * Pass additional context to links
   */
  context?: OperationContext;
  signal?: AbortSignal;
}

function createChain<
  TRouter extends AnyRouter,
  TInput = unknown,
  TOutput = unknown
>(opts: {
  links: OperationLink<TRouter, TInput, TOutput>[];
  op: Operation<TInput>;
}): OperationResultObservable<TRouter, TOutput> {
  return observable((observer) => {
    function execute(index = 0, op = opts.op) {
      const next = opts.links[index];
      if (!next) {
        throw new Error(
          'No more links to execute - did you forget to add an ending link?'
        );
      }
      const subscription = next({
        op,
        next(nextOp) {
          const nextObserver = execute(index + 1, nextOp);

          return nextObserver;
        },
      });
      return subscription;
    }

    const obs$ = execute();
    return obs$.subscribe(observer);
  });
}

type CreateTRPCClientOptions<TRouter extends AnyRouter> =
  | CreateTRPCClientBaseOptions<TRouter> & {
      links: TRPCLink<TRouter>[];
    };

type CreateTRPCClientBaseOptions<TRouter extends AnyRouter> =
  TRouter['_def']['_config']['transformer'] extends DefaultDataTransformer
    ? {
        /**
         * Data transformer
         *
         * You must use the same transformer on the backend and frontend
         * @link https://trpc.io/docs/data-transformers
         **/
        transformer?: 'You must set a transformer on the backend router';
      }
    : TRouter['_def']['_config']['transformer'] extends DataTransformerOptions
    ? {
        /**
         * Data transformer
         *
         * You must use the same transformer on the backend and frontend
         * @link https://trpc.io/docs/data-transformers
         **/
        transformer: TRouter['_def']['_config']['transformer'] extends CombinedDataTransformer
          ? DataTransformerOptions
          : TRouter['_def']['_config']['transformer'];
      }
    : {
        /**
         * Data transformer
         *
         * You must use the same transformer on the backend and frontend
         * @link https://trpc.io/docs/data-transformers
         **/
        transformer?:
          | /** @deprecated **/ ClientDataTransformerOptions
          | CombinedDataTransformer;
      };
