import { RouteMeta } from "@analogjs/router";
import { Component, inject } from "@angular/core";
import { SupabaseAuthService } from "../auth.service";
import { Router } from "@angular/router";

export const routeMeta: RouteMeta = {
  canActivate: [async () => {
    const authService = inject(SupabaseAuthService);
    const router = inject(Router);
    const { data, error } = await authService.getSession();

    if (error || !data?.session) {
      router.navigate(['/login']);
      return false;
    }

    return true;
  }]
};

@Component({
  selector: 'app-protected-page',
  template: `
    <h2>Protected Page</h2>
  `,
  styles: `
    form { 
      display: flex;
      padding: 4px;
      flex-direction: column;
    }
  `
})
export default class ProtectedPage { }