import {
  type PageServerAction,
  redirect,
  json,
  fail,
} from '@analogjs/router/server/actions';
import { readFormData } from 'h3';

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

  console.log({ email: body.get('email') });

  return json({ type: 'success' });
}
