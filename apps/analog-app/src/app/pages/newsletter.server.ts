import {
  defineAction,
  fail,
  json,
  redirect,
} from '@analogjs/router/server/actions';
import * as v from 'valibot';

export type NewsletterSubmitResponse = {
  type: 'success';
  email: string;
};

export function load() {
  return {
    loaded: true,
  };
}

const NewsletterSchema = v.object({
  email: v.pipe(v.string(), v.nonEmpty('Email is required')),
});

export const action = defineAction({
  schema: NewsletterSchema,
  handler: async ({ data }) => {
    if (data.email.length < 10) {
      return redirect('/');
    }

    return json<NewsletterSubmitResponse>({
      type: 'success',
      email: data.email,
    });
  },
});
