import { ServerContext } from '@analogjs/router/tokens';


import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';

export function createClient(context: ServerContext) {
  return createServerClient(process.env['VITE_PUBLIC_SUPABASE_URL']!, process.env['VITE_PUBLIC_SUPABASE_ANON_KEY']!, {
    cookies: {
      getAll() {
        return parseCookieHeader(context.req.headers.cookie ?? '')
      },

      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          context.res.appendHeader('Set-Cookie', serializeCookieHeader(name, value, options))
        )
      },
    },
  })
}