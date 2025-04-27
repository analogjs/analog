import { computed, Injectable, signal } from "@angular/core";
import { injectSupabaseClient } from "./supabase-client";

@Injectable({
  providedIn: 'root',
})
export class SupabaseAuthService {
  private supabase = injectSupabaseClient()
  private session = signal<unknown>(null);
  readonly loggedIn = computed(() => !!this.session());

  constructor() {
    this.getSession().then(({ data: { session } }) => {
      this.session.set(session);
    });

    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.session.set(session);
    });
  }

  getSession() {
    return this.supabase.auth.getSession();
  }

  async logout() {
    await this.supabase.auth.signOut();
  }
}