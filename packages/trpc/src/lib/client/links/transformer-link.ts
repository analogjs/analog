import { TRPCLink } from '@trpc/client';
import { AnyRouter } from '@trpc/server';
import { observable } from '@trpc/server/observable';

export function transformerLink<TRouter extends AnyRouter>(
  transformer: any,
): TRPCLink<TRouter> {
  return () => {
    return ({ op, next }) => {
      return observable((observer) => {
        // Serialize input
        const serializedOp = {
          ...op,
          input: transformer.input.serialize(op.input),
        };

        const subscription = next(serializedOp).subscribe({
          next(result) {
            if (
              'result' in result &&
              result.result &&
              'data' in result.result
            ) {
              observer.next({
                ...result,
                result: {
                  ...result.result,
                  data: transformer.output.deserialize(result.result.data),
                },
              });
            } else {
              observer.next(result);
            }
          },
          error: observer.error,
          complete: observer.complete,
        });

        return subscription;
      });
    };
  };
}
