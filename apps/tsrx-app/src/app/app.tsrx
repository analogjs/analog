import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

// The root shell is a TSRX component too. `use` brings attribute directives
// into scope; `<RouterOutlet />` resolves from @angular/router's declarations.
export const AppMeta = { selector: 'app-root' } satisfies Component;

const links = [
  { path: '/', label: 'Home' },
  { path: '/counter', label: 'Counter' },
  { path: '/products', label: 'Products' },
  { path: '/contact', label: 'Contact' },
  { path: '/blog', label: 'Blog' },
  { path: '/boundary', label: 'Error boundary' },
  { path: '/defer', label: 'Defer' },
];

export function App() @{
  <>
    <header>
      <strong>{'Analog + TSRX'}</strong>
      <nav>
        @for (const link of links; key link.path) {
          <a
            use={[RouterLink, RouterLinkActive]}
            routerLink={link.path}
            routerLinkActive="active"
            routerLinkActiveOptions={{ exact: link.path === '/' }}
          >
            {link.label}
          </a>
        }
      </nav>
    </header>
    <main>
      <RouterOutlet />
    </main>
    <style>
      header { display: flex; gap: 1.5rem; align-items: center; padding: 1rem; border-bottom: 1px solid #ddd; }
      nav { display: flex; gap: 1rem; }
      .active { font-weight: 600; text-decoration: underline; }
      main { padding: 1rem; }
    </style>
  </>
}
