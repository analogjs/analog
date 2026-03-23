import { defineServerRoute } from '@analogjs/router/server/actions';
import * as v from 'valibot';

const InputSchema = v.object({
  message: v.pipe(v.string(), v.nonEmpty('message is required')),
});

export default defineServerRoute({
  input: InputSchema,
  handler: ({ data, event }) => ({
    echo: data.message,
    method: event.method,
  }),
});
