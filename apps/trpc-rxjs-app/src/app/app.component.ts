import { ChangeDetectionStrategy, Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";

@Component({
  selector: 'trpc-rxjs-app-root',
  standalone: true,
  imports: [RouterOutlet],
  host: {
    class: 'max-w-screen-md mx-auto block h-full bg-zinc-900 text-zinc-50',
  },
  changeDetection: ChangeDetectionStrategy.Default,
  template: ` <router-outlet></router-outlet> `,
})
export class AppComponent {}
