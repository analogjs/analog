import { injectRouteData, type RouteMeta } from '@analogjs/router';
import { Component } from '@angular/core';

export const routeMeta = {
  title: 'About',
  data: { heading: 'About typed routing', revision: 2 },
} satisfies RouteMeta;

@Component({
  template: `
    <h1 id="about-heading">{{ data().heading }}</h1>
    <p id="about-revision">Revision {{ data().revision }}</p>
    <section id="details">
      <h2>Details</h2>
      <p>Reached with a typed hash.</p>
    </section>
  `,
})
export default class AboutPage {
  readonly data = injectRouteData('/about');
}
