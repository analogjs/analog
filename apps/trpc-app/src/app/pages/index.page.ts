import { Component } from '@angular/core';
import { injectTRPCClient } from '../../trpc-client';
import { AsyncPipe, DatePipe, JsonPipe, NgFor, NgIf } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { waitFor } from '@analogjs/trpc';
import { Note } from '../../note';

@Component({
  selector: 'trpc-app-home',
  standalone: true,
  imports: [AsyncPipe, FormsModule, NgFor, DatePipe, NgIf, JsonPipe],
  host: {
    class:
      'flex min-h-screen flex-col h-full text-zinc-900 bg-zinc-50 px-4 pt-8 pb-32',
  },
  template: `
    <main class="flex-1 mx-auto">
      <section class="space-y-6 pb-8 pt-6 md:pb-12 md:pt-10 lg:py-32">
        <div
          class="container flex max-w-[64rem] flex-col items-center gap-4 text-center"
        >
          <a
            class="rounded-2xl bg-zinc-200 px-4 py-1.5 text-sm font-medium"
            target="_blank"
            href="https://twitter.com/analogjs"
            >Follow along on Twitter</a
          >
          <h1
            class="font-heading font-medium text-3xl sm:text-5xl md:text-6xl lg:text-7xl"
          >
            Analog. The fullstack Angular meta-framework
          </h1>
          <p
            class="max-w-[42rem] leading-normal text-muted-foreground sm:text-xl sm:leading-8"
          >
            Analog is for building applications and websites with Angular.
            <br />Powered by Vite.
          </p>
          <div class="space-x-4">
            <a
              class="inline-flex items-center justify-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-zinc-950 text-zinc-50 hover:bg-zinc-950/90 h-11 px-8 rounded-md"
              href="https://analogjs.org"
              >Read the docs</a
            ><a
              target="_blank"
              rel="noreferrer"
              class="inline-flex items-center justify-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background border border-input hover:bg-zinc-50 hover:text-zinc-950 h-11 px-8 rounded-md"
              href="https://github.com/analogjs/analog"
              >GitHub</a
            >
          </div>
        </div>
      </section>
      <section
        id="features"
        class="container space-y-6 bg-zinc-50 py-8 dark:bg-transparent md:py-12 lg:py-24"
      >
        <div
          class="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center"
        >
          <h2
            class="font-medium text-3xl leading-[1.1] sm:text-3xl md:text-6xl"
          >
            Features
          </h2>
          <p
            class="max-w-[85%] leading-normal text-muted-foreground sm:text-lg sm:leading-7"
          >
            Analog comes with a set of tools that aim to let you build powerful
            full stack applications while providing the best possible developer
            experience.
          </p>
        </div>
        <div
          class="mx-auto grid justify-center gap-4 sm:grid-cols-2 md:max-w-[64rem] md:grid-cols-3"
        >
          <div
            class="relative overflow-hidden rounded-lg border bg-background p-2"
          >
            <div
              class="absolute top-2 right-2 rounded-2xl bg-zinc-200 px-3 py-1.5 text-xs font-medium"
            >
              Installed
            </div>
            <div class="flex h-[180px] flex-col justify-between rounded-md p-6">
              <svg
                class="h-12 w-12 fill-current"
                viewBox="0 0 632 712"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M316.544 0L0 712H118.024L181.659 552.687H450.341L513.976 712H632L316.544 0ZM409.005 454.48H224.083L316.544 231.332L409.005 454.48Z"
                />
              </svg>
              <div class="space-y-2">
                <h3 class="font-bold">Angular</h3>
                <p class="text-sm text-muted-foreground">
                  Ready to built enterprise grade applications with Angular.
                </p>
              </div>
            </div>
          </div>
          <div
            class="relative overflow-hidden rounded-lg border bg-background p-2"
          >
            <div
              class="absolute top-2 right-2 rounded-2xl bg-zinc-200 px-3 py-1.5 text-xs font-medium"
            >
              Installed
            </div>
            <div class="flex h-[180px] flex-col justify-between rounded-md p-6">
              <svg
                class="h-12 w-12 fill-current"
                viewBox="0 0 665 655"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M648.198 96.5064L349.763 629.943C343.601 640.956 327.771 641.021 321.516 630.061L17.1632 96.5578C10.3497 84.6143 20.5669 70.1474 34.1068 72.5665L332.862 125.945C334.768 126.286 336.719 126.283 338.625 125.936L631.132 72.643C644.627 70.1845 654.892 84.5394 648.198 96.5064Z"
                />
                <path
                  d="M475.175 2.55254L254.324 45.8098C250.694 46.5207 248.006 49.5956 247.787 53.2859L234.202 282.639C233.882 288.041 238.845 292.234 244.12 291.018L305.608 276.833C311.361 275.507 316.559 280.572 315.377 286.355L297.109 375.774C295.88 381.792 301.532 386.938 307.412 385.153L345.39 373.619C351.277 371.832 356.935 376.993 355.689 383.016L326.658 523.473C324.841 532.259 336.532 537.05 341.408 529.517L344.665 524.486L524.627 165.488C527.64 159.477 522.443 152.623 515.839 153.897L452.547 166.107C446.599 167.254 441.539 161.717 443.218 155.9L484.527 12.7545C486.207 6.92797 481.129 1.38647 475.175 2.55254Z"
                  fill="#52525B"
                />
              </svg>

              <div class="space-y-2">
                <h3 class="font-bold">Vite</h3>
                <p class="text-sm">
                  Based on Vite. Super fast. Super ecosystem.
                </p>
              </div>
            </div>
          </div>
          <div
            class="relative overflow-hidden rounded-lg border bg-background p-2"
          >
            <div
              class="absolute top-2 right-2 rounded-2xl bg-zinc-200 px-3 py-1.5 text-xs font-medium"
            >
              Installed
            </div>
            <div class="flex h-[180px] flex-col justify-between rounded-md p-6">
              <svg
                class="h-12 w-12 fill-current"
                viewBox="0 0 739 739"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fill-rule="evenodd"
                  clip-rule="evenodd"
                  d="M369.5 739C573.569 739 739 573.569 739 369.5C739 165.431 573.569 0 369.5 0C165.431 0 0 165.431 0 369.5C0 573.569 165.431 739 369.5 739ZM295.271 157.572C296.406 152.559 300.86 149 306 149H400.5C403.738 149 406.812 150.427 408.902 152.9C410.992 155.374 411.886 158.642 411.346 161.835L385.517 314.5H484.5C488.463 314.5 492.119 316.631 494.072 320.079C496.024 323.527 495.972 327.758 493.934 331.157L338.934 589.657C336.391 593.898 331.331 595.921 326.565 594.601C321.8 593.282 318.5 588.945 318.5 584V418.5H250C246.656 418.5 243.494 416.979 241.406 414.366C239.319 411.754 238.533 408.334 239.271 405.072L295.271 157.572Z"
                />
              </svg>
              <div class="space-y-2">
                <h3 class="font-bold">Nitro</h3>
                <p class="text-sm text-muted-foreground">
                  Backend server that runs everywhere
                </p>
              </div>
            </div>
          </div>
          <div
            class="relative overflow-hidden rounded-lg border bg-background p-2"
          >
            <div
              class="absolute top-2 right-2 rounded-2xl bg-zinc-200 px-3 py-1.5 text-xs font-medium"
            >
              Installed
            </div>
            <div class="flex h-[180px] flex-col justify-between rounded-md p-6">
              <svg viewBox="0 0 24 24" class="h-12 w-12 fill-current">
                <path
                  d="M12.001 4.8c-3.2 0-5.2 1.6-6 4.8 1.2-1.6 2.6-2.2 4.2-1.8.913.228 1.565.89 2.288 1.624C13.666 10.618 15.027 12 18.001 12c3.2 0 5.2-1.6 6-4.8-1.2 1.6-2.6 2.2-4.2 1.8-.913-.228-1.565-.89-2.288-1.624C16.337 6.182 14.976 4.8 12.001 4.8zm-6 7.2c-3.2 0-5.2 1.6-6 4.8 1.2-1.6 2.6-2.2 4.2-1.8.913.228 1.565.89 2.288 1.624 1.177 1.194 2.538 2.576 5.512 2.576 3.2 0 5.2-1.6 6-4.8-1.2 1.6-2.6 2.2-4.2 1.8-.913-.228-1.565-.89-2.288-1.624C10.337 13.382 8.976 12 6.001 12z"
                ></path>
              </svg>
              <div class="space-y-2">
                <h3 class="font-bold">TailwindCSS</h3>
                <p class="text-sm text-muted-foreground">
                  The utility first CSS framework.
                </p>
              </div>
            </div>
          </div>
          <div
            class="relative overflow-hidden rounded-lg border bg-background p-2"
          >
            <div
              class="absolute top-2 right-2 rounded-2xl bg-zinc-200 px-3 py-1.5 text-xs font-medium"
            >
              Installed
            </div>
            <div class="flex h-[180px] flex-col justify-between rounded-md p-6">
              <svg
                class="h-12 w-12 fill-current"
                viewBox="0 0 697 697"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <g clip-path="url(#clip0_402_286)">
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M204.199 0H492.801C605.577 0 697 91.4231 697 204.199V492.801C697 605.577 605.577 697 492.801 697H204.199C91.4231 697 0 605.577 0 492.801V204.199C0 91.4231 91.4231 0 204.199 0ZM444.505 157.925L347.746 102.1L251.113 157.925V190.09L251.049 190.093L136.447 256.254V372.654L106.257 390.083V501.701L202.954 557.62L245.281 533.142L349.034 593.057L453.411 532.794L496.34 557.62L593.037 501.796V390.083L561.621 371.948V256.254L444.505 188.62V157.925ZM444.505 269.574V217.648L536.489 270.768V357.437L496.34 334.258L399.644 390.083V501.701L428.298 518.274L349.034 564.03L270.395 518.618L299.649 501.701V390.083L202.954 334.258L161.579 358.144V270.768L251.049 219.089L251.113 219.087V269.574L347.809 325.4L444.505 269.574ZM424.777 419.173V487.313L483.774 521.368V453.228L424.777 419.173ZM508.907 453.134L567.904 419.079V487.219L508.907 521.368V453.134ZM131.389 419.079V487.219L190.387 521.273V453.134L131.389 419.079ZM215.519 453.134L274.517 419.079V487.219L215.519 521.273V453.134ZM496.34 363.349L437.343 397.403L496.34 431.489L555.338 397.403L496.34 363.349ZM143.955 397.403L202.954 363.254L261.951 397.403L202.954 431.394L143.955 397.403ZM276.245 186.921V255.061L335.179 289.115V221.006L276.245 186.921ZM360.375 221.006L419.31 186.921V255.061L360.375 289.083V221.006ZM347.746 131.127L288.811 165.181L347.746 199.236L406.744 165.181L347.746 131.127Z"
                    fill="black"
                  />
                </g>
                <defs>
                  <clipPath id="clip0_402_286">
                    <rect width="697" height="697" fill="white" />
                  </clipPath>
                </defs>
              </svg>
              <div class="space-y-2">
                <h3 class="font-bold">tRPC</h3>
                <p class="text-sm text-muted-foreground">
                  End-to-end typesafe APIs made easy.
                </p>
              </div>
            </div>
          </div>
          <div
            class="relative overflow-hidden rounded-lg border bg-background p-2"
          >
            <div
              class="absolute top-2 right-2 rounded-2xl bg-zinc-200 px-3 py-1.5 text-xs font-medium"
            >
              Installed
            </div>
            <div class="flex h-[180px] flex-col justify-between rounded-md p-6">
              <svg
                class="h-12 w-12 fill-current"
                viewBox="0 0 452 282"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M226 180.48L167.617 274.48L69.6833 114.68V282H0V0H69.6833L167.617 167.32V92.12L224.117 180.48H226ZM237.3 73.32V0H167.617V73.32H237.3ZM342.767 150.4C334.691 149.895 326.668 151.999 319.884 156.401C313.1 160.803 307.916 167.268 305.1 174.84C310.016 167.847 317.171 162.733 325.386 160.341C333.602 157.949 342.389 158.422 350.3 161.68C357.833 165.44 369.133 169.2 374.783 167.32C371.183 162.158 366.399 157.929 360.83 154.986C355.261 152.042 349.068 150.47 342.767 150.4ZM406.8 169.2C399.267 169.2 391.733 165.44 386.083 157.92L382.317 152.28C379.912 147.965 376.718 144.139 372.9 141C366.153 136.783 358.241 134.809 350.3 135.36C341.111 135.328 332.113 137.981 324.416 142.992C316.719 148.003 310.659 155.153 306.983 163.56C311.389 157.231 317.41 152.192 324.422 148.966C331.434 145.739 339.182 144.442 346.865 145.209C354.548 145.976 361.885 148.779 368.119 153.328C374.352 157.876 379.253 164.005 382.317 171.08C384.17 173.702 386.814 175.664 389.864 176.679C392.913 177.693 396.208 177.708 399.267 176.72C408.683 176.72 406.8 184.24 421.867 186.12V184.24C421.867 176.72 416.217 174.84 406.8 171.08V169.2ZM444.467 193.64C446.63 192.619 448.473 191.03 449.8 189.043C451.127 187.056 451.888 184.746 452 182.36C452 125.96 406.8 78.96 350.3 78.96C333.543 78.929 317.038 83.0317 302.253 90.9034C287.467 98.775 274.859 110.172 265.55 124.08L237.3 78.96H167.617L233.533 180.48L169.5 282H237.3L263.667 235L293.8 280.12H359.717L301.333 186.12C300.925 184.262 300.925 182.338 301.333 180.48C301.324 167.337 306.422 154.703 315.555 145.236C324.688 135.769 337.143 130.207 350.3 129.72C378.55 129.72 382.317 146.64 387.967 154.16C401.15 169.2 425.633 163.56 425.633 182.36C425.733 184.528 426.368 186.638 427.483 188.501C428.597 190.365 430.156 191.924 432.02 193.041C433.884 194.158 435.996 194.797 438.168 194.901C440.34 195.006 442.503 194.572 444.467 193.64ZM452 197.4C448.233 203.04 440.7 203.04 436.933 208.68C435.05 214.32 438.817 216.2 438.817 216.2C438.817 216.2 446.35 219.96 450.117 210.56V197.4H452Z"
                />
              </svg>
              <div class="space-y-2">
                <h3 class="font-bold">Nx</h3>
                <p class="text-sm text-muted-foreground">
                  Next generation build system with first class monorepo
                  support.
                </p>
              </div>
            </div>
          </div>
        </div>
        <div class="mx-auto text-center md:max-w-[58rem]">
          <p
            class="leading-normal text-muted-foreground sm:text-lg sm:leading-7"
          >
            To see all available features and learn how to use them check out
            the official
            <a
              target="_blank"
              rel="noreferrer"
              class="underline underline-offset-4"
              href="https://analogjs.org/"
              >documentation</a
            >.
          </p>
        </div>
      </section>
      <section id="open-source" class="container py-8 md:py-12 lg:py-24">
        <div
          class="mx-auto flex max-w-[58rem] flex-col items-center justify-center gap-4 text-center"
        >
          <h2
            class="font-medium text-3xl leading-[1.1] sm:text-3xl md:text-6xl"
          >
            Proudly Open Source
          </h2>
          <p
            class="max-w-[85%] leading-normal text-muted-foreground sm:text-lg sm:leading-7"
          >
            Analog is open source and powered by open source software.
            <br />
            The code is available on
            <a
              target="_blank"
              rel="noreferrer"
              class="underline underline-offset-4"
              href="https://github.com/analogjs/analog"
              >GitHub</a
            >.
          </p>
        </div>
      </section>

      <section id="trpc-demo" class="container py-8 md:py-12 lg:py-24">
        <div
          class="mx-auto flex max-w-[58rem] flex-col items-center justify-center gap-4 text-center"
        >
          <h2 class="font-medium text-3xl leading-[1.1]">Leave a note</h2>
          <p
            class="max-w-[85%] leading-normal text-muted-foreground sm:text-lg sm:leading-7"
          >
            This is an example of how to you can use tRPC to superpower you
            client server interaction.
          </p>
        </div>
        <form
          class="mt-8 pb-2 flex items-center"
          #f="ngForm"
          (ngSubmit)="addPost(f)"
        >
          <label class="sr-only" for="newNote"> Note </label>
          <input
            required
            autocomplete="off"
            data-testid="newNoteInput"
            name="newNote"
            [(ngModel)]="newNote"
            class="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            data-testid="addNoteBtn"
            class="ml-2 inline-flex items-center justify-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background border border-input hover:bg-zinc-50 hover:text-zinc-950 px-8 h-10 rounded-md"
          >
            +
          </button>
        </form>
        <div class="mt-4 flex flex-col gap-4">
          <div
            *ngFor="
              let note of notes ?? [];
              trackBy: noteTrackBy;
              let i = index
            "
            class="note relative overflow-hidden rounded-lg border bg-background p-2"
          >
            <button
              [attr.data-testid]="'removeNoteAtIndexBtn' + i"
              class="absolute top-4 right-4 inline-flex items-center justify-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background border border-transparent hover:bg-zinc-100 hover:text-zinc-950 h-6 px-2 rounded-md"
              (click)="removePost(note.id)"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
                class="w-4 h-4"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
            <div class="flex h-[180px] flex-col justify-between rounded-md p-6">
              <div class="space-y-2">
                <h3 class="font-bold">{{ note.note }}</h3>
                <p class="text-sm text-muted-foreground">
                  {{ note.createdAt | date }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div
          *ngIf="notes.length === 0"
          class="no-notes relative overflow-hidden rounded-lg border bg-background p-2"
        >
          <div class="flex h-[180px] flex-col justify-between rounded-md p-6">
            <div class="space-y-2">
              <h3 class="font-bold">
                {{ loadingPosts ? 'Loading...' : 'No notes yet...' }}
              </h3>
              <p class="text-sm text-muted-foreground">
                {{
                  loadingPosts
                    ? ''
                    : 'Add a new one and see them appear here...'
                }}
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  `,
})
export default class HomeComponent {
  private _trpc = injectTRPCClient();
  public loadingPosts = false;
  public notes: Note[] = [];
  public newNote = '';

  constructor() {
    waitFor(this._trpc.note.list.query().then((notes) => (this.notes = notes)));
  }

  public noteTrackBy = (index: number, note: Note) => {
    return note.id;
  };

  public addPost(form: NgForm) {
    if (!form.valid) {
      form.form.markAllAsTouched();
      return;
    }
    this._trpc.note.create
      .mutate({ title: this.newNote })
      .then(() => this.fetchPosts());
    this.newNote = '';
    form.form.reset();
  }

  public removePost(id: number) {
    this._trpc.note.remove.mutate({ id }).then(() => this.fetchPosts());
  }

  private fetchPosts() {
    this.loadingPosts = true;
    this._trpc.note.list.query().then((notes) => {
      this.loadingPosts = false;
      this.notes = notes;
    });
  }
}
