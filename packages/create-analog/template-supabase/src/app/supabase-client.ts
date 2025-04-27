import { InjectionToken, inject, FactoryProvider } from '@angular/core';
import { Database } from '@supabase/database.types';
import { createBrowserClient, SupabaseClient } from '@supabase/ssr';

export type SupabaseClientType = SupabaseClient<Database>;

const defaultConfig = {
  realtime: {
    params: {
      eventsPerSecond: 2,
    },
  },
};

function createSupabaseClient(config = defaultConfig): SupabaseClientType {
  return createBrowserClient<Database>(
    import.meta.env['VITE_PUBLIC_SUPABASE_URL'],
    import.meta.env['VITE_PUBLIC_SUPABASE_ANON_KEY'],
    config
  );
}

const SUPABASE_CLIENT = new InjectionToken<SupabaseClientType>(
  'SUPABASE_CLIENT',
  {
    factory: () => createSupabaseClient(defaultConfig)
  }
);

export function provideSupabaseClient(config = defaultConfig): FactoryProvider {
  return {
    provide: SUPABASE_CLIENT,
    useFactory: () => createSupabaseClient(config)
  };
}

export function injectSupabaseClient(): SupabaseClientType {
  return inject(SUPABASE_CLIENT);
}