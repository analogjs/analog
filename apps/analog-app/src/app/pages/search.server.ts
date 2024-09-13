import type { PageServerLoad } from '@analogjs/router';
import {
  fail,
  json,
  redirect,
  type PageServerAction,
} from '@analogjs/router/server/actions';
import { getQuery, readFormData } from 'h3';

export function load({ event }: PageServerLoad) {
  const query = getQuery(event);
  console.log('loaded', query['search']);
  return {
    loaded: true,
  };
}

export async function action({ event }: PageServerAction) {
  const body = await readFormData(event);
  const email = body.get('email') as string;

  if (!email) {
    return fail(422, { errors: { email: 'Email is required' } });
  }

  if (email.length < 10) {
    return redirect('/');
  }

  console.log({ email: body.get('email') });

  return json({ type: 'success' });
}
