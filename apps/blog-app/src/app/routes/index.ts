import { defineRouteMeta } from '@analogjs/router';
import { Route } from '@angular/router';

export const routeMeta = defineRouteMeta({
  redirectTo: '/blog',
  pathMatch: 'full',
} as Route);
