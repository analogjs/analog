import {
  type PageServerAction,
  redirect,
  json,
  fail,
} from '@analogjs/router/server/actions';
import { readFormData } from 'h3';

export type NewsletterSubmitResponse = {
  type: 'success';
  email: string;
};

export function load() {
  return {
    loaded: true,
  };
}

export async function action({ event }: PageServerAction) {
  const body = await readFormData(event);
  const email = body.get('email') as string;

  if (!email) {
    return fail(422, { email: 'Email is required' });
  }

  if (email.length < 10) {
    return redirect('/');
  }

  return json<NewsletterSubmitResponse>({ type: 'success', email });
}
