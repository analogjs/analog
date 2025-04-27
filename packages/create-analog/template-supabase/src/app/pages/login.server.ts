import { fail, PageServerAction, redirect } from '@analogjs/router/server/actions';
import { ServerRequest } from '@analogjs/router/tokens';
import { readFormData } from 'h3';

import { createClient } from '../../server/supabase';

export async function action({ event }: PageServerAction) {
  const form = await readFormData(event);
  const email = form.get('email') as string;
  const password = form.get('password') as string;

  if (!email) {
    return fail(422, { email: 'Email is required' });
  }

  if (!password) {
    return fail(422, { password: 'Password is required' });
  }

  const client = createClient({ req: event.node.req as ServerRequest, res: event.node.res });

  const { error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    return fail(400, { auth: 'Invalid username or password' });
  }

  return redirect('/');
}