import type { RouteMeta } from '@analogjs/router';
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

export const routeMeta = {
  data: { theme: 'marketing' as const },
} satisfies RouteMeta;

@Component({
  imports: [RouterOutlet],
  template: `
    <div id="marketing-layout">
      <router-outlet />
    </div>
  `,
})
export default class MarketingLayout {}
