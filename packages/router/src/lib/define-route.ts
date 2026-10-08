import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';

/**
 * Returns the instance of Angular Router
 *
 * @returns The router
 */
export const injectRouter = (): Router => {
  return inject(Router);
};

/**
 * Returns the instance of the Activate Route for the component
 *
 * @returns The activated route
 */
export const injectActivatedRoute = (): ActivatedRoute => {
  return inject(ActivatedRoute);
};
