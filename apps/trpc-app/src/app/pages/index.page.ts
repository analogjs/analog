import { ChangeDetectionStrategy, Component } from "@angular/core";
import { injectTRPCClient } from "../../trpc-client";
import { AsyncPipe, DatePipe, JsonPipe, NgFor, NgIf } from "@angular/common";
import { FormsModule, NgForm } from "@angular/forms";
import { Note } from "../../note";
import { BehaviorSubject, switchMap } from "rxjs";
import { waitFor } from "@analogjs/trpc";

const inputTw =
  'focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-0 block w-full appearance-none rounded-lg px-3 py-2 transition-colors text-base leading-tight md:text-sm bg-black/[.05] dark:bg-zinc-50/10 focus:bg-white dark:focus:bg-dark placeholder:text-zinc-500 dark:placeholder:text-zinc-400 contrast-more:border contrast-more:border-current';
const btnTw =
  'focus-visible:ring-2 focus-visible:ring-zinc-50 focus-visible:outline-0 flex items-center justify-center rounded-lg px-2 py-1.5 text-sm font-bold tracking-tight shadow-xl shadow-red-500/20 bg-[#DD0031] hover:bg-opacity-70 text-zinc-800 hover:text-primary-darker';

@Component({
  selector: 'trpc-app-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AsyncPipe, FormsModule, NgFor, DatePipe, NgIf, JsonPipe],
  host: {
    class: 'block h-full p-4',
  },
  template: `
    <div class="justify-center flex mt-20 mb-8 items-center">
      <h1 class="italic text-6xl text-[#DD0031] font-bold">Analog + tRPC</h1>
      <img
        class="ml-2 block w-32"
        alt="Spartan Logo"
        src="/assets/spartan.svg"
      />
    </div>
    <form class="py-2 flex items-center" #f="ngForm" (ngSubmit)="addPost(f)">
      <label class="sr-only" for="newNote"> Note </label>
      <input
        required
        autocomplete="off"
        data-testid="newNoteInput"
        class="${inputTw}"
        name="newNote"
        [(ngModel)]="newNote"
      />
      <button data-testid="addNoteBtn" class="ml-2 ${btnTw}">+</button>
    </form>
    <div class="mt-4" *ngIf="notes$ | async as notes; else loading">
      <div
        class="note mb-4 p-4 font-normal border border-zinc-500/40 rounded-md"
        *ngFor="let note of notes; trackBy: noteTrackBy; let i = index"
      >
        <div class="flex items-center justify-between">
          <p class="text-sm text-zinc-400">{{ note.createdAt | date }}</p>
          <button
            [attr.data-testid]="'removeNoteAtIndexBtn' + i"
            class="!text-xs h-6 !bg-opacity-10 hover:!bg-opacity-50 !text-zinc-50 ${btnTw}"
            (click)="removePost(note.id)"
          >
            x
          </button>
        </div>
        <p class="mb-4">{{ note.note }}</p>
      </div>

      <div
        class="no-notes text-center rounded-xl p-20 bg-zinc-950/40"
        *ngIf="notes.length === 0"
      >
        <h3 class="text-xl font-medium">No notes yet!</h3>
        <p class="text-zinc-400">Add a new one and see them appear here...</p>
      </div>
    </div>
    <ng-template #loading>
      <div class="flex items-center justify-center mt-4">
        <div role="status">
          <svg
            aria-hidden="true"
            class="w-8 h-8 mr-2 text-gray-200 animate-spin dark:text-gray-600 fill-blue-600"
            viewBox="0 0 100 101"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
              fill="currentColor"
            />
            <path
              d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
              fill="currentFill"
            />
          </svg>
          <span class="sr-only">Loading...</span>
        </div>
      </div>
    </ng-template>
  `,
})
export default class HomeComponent {
  private _trpc = injectTRPCClient();
  public triggerRefresh$ = new BehaviorSubject(true);
  public notes$ = this.triggerRefresh$.pipe(
    switchMap(() => this._trpc.note.list.query())
  );
  public newNote = '';

  constructor() {
    void waitFor(this.notes$);
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
      .subscribe(() => this.triggerRefresh$.next(true));
    this.newNote = '';
    form.form.reset();
  }

  public removePost(id: number) {
    this._trpc.note.remove
      .mutate({ id })
      .subscribe(() => this.triggerRefresh$.next(true));
  }
}
