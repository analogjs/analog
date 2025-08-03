import { TRPCLink } from '@trpc/client';
import { AnyRouter } from '@trpc/server';
import { observable } from '@trpc/server/observable';

export function transformerLink<TRouter extends AnyRouter>(
  transformer: any,
): TRPCLink<TRouter> {
  const inputSerializer = transformer.input?.serialize ?? transformer.serialize;
  const outputDeserializer =
    transformer.output?.deserialize ?? transformer.deserialize;

  if (
    typeof inputSerializer !== 'function' ||
    typeof outputDeserializer !== 'function'
  ) {
    throw new Error(
      'Invalid transformer provided; must have serialize and deserialize methods.',
    );
  }

  return () => {
    return ({ op, next }) => {
      return observable((observer) => {
        // Serialize input
        const serializedOp = {
          ...op,
          input: inputSerializer(op.input),
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
                  data: outputDeserializer(result.result.data),
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
