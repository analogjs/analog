import { Component } from '@angular/core';
import type { RouteMeta } from '@analogjs/router';

export const routeMeta: RouteMeta = {
  resolve: {
    data: (route) => {
      throw Object.assign(new Error('private-resolver-error-marker'), {
        statusCode: Number(route.paramMap.get('status')),
      });
    },
  },
};

@Component({ template: '<h1>This resolver did not complete</h1>' })
export default class ResolverErrorPage {}
