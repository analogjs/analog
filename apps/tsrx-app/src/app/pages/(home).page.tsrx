import type { RouteMeta } from '@analogjs/router';
import { RouterLink } from '@angular/router';

export const routeMeta: RouteMeta = {
  title: 'Analog + TSRX',
  meta: [
    {
      name: 'description',
      content: 'Analog features demonstrated with TSRX components.',
    },
  ],
};

const demos = [
  { path: '/counter', title: 'Counter', about: 'signals, inputs, models, outputs, providers and host bindings' },
  { path: '/products', title: 'Products', about: 'a layout route, server loads, an API route and route params' },
  { path: '/contact', title: 'Contact', about: 'form actions with server-side validation' },
  { path: '/blog', title: 'Blog', about: 'markdown content files' },
  { path: '/boundary', title: 'Error boundary', about: '@try / @catch as Angular @boundary' },
];

export default function HomePage() @{
  <section>
    <h1 id="home-title">{'TSRX components in Analog'}</h1>
    <p>
      {'Every page, layout and component in this app is a .tsrx file, compiled to an Angular component.'}
    </p>
    <ul id="demos">
      @for (const demo of demos; key demo.path) {
        <li>
          <a use={[RouterLink]} routerLink={demo.path}>{demo.title}</a>
          {': '}{demo.about}
        </li>
      }
    </ul>
  </section>
}
