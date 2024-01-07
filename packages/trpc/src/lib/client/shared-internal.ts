import {
  AnyRouter,
  ClientDataTransformerOptions,
  CombinedDataTransformer,
  DataTransformerOptions,
  DefaultDataTransformer,
} from '@trpc/server';
import {
  Operation,
  TRPCLink,
  OperationContext,
  OperationLink,
  OperationResultObservable,
} from '@trpc/client';
import { observable } from '@trpc/server/observable';

// Removed subscription
export type TRPCType = 'query' | 'mutation';

// Removed subscription and requestAsPromise
export type UntypedClientProperties =
  | 'links'
  | 'runtime'
  | 'requestId'
  | '$request'
  | 'query'
  | 'mutation';

/*
 * One to one copy of the trpc client internal code
 * Nothing was changed, but we can not import these methods because
 * they are not exported
 */
export type IntersectionError<TKey extends string> =
  `The property '${TKey}' in your router collides with a built-in method, rename this router or procedure on your backend.`;

export interface TRPCRequestOptions {
  /**
   * Pass additional context to links
   */
  context?: OperationContext;
}

export function createChain<
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

export type CreateTRPCClientOptions<TRouter extends AnyRouter> =
  | CreateTRPCClientBaseOptions<TRouter> & {
      links: TRPCLink<TRouter>[];
    };

export type CreateTRPCClientBaseOptions<TRouter extends AnyRouter> =
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
