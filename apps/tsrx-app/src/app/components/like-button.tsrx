import { signal } from '@angular/core';

// Hydrated incrementally by `@defer (hydrate on interaction)`: rendered on the
// server, with its code loaded on the first click, which Angular then replays.
export function LikeButton() @{
  const likes = signal(0);

  <button id="like" onClick={() => likes.update((n) => n + 1)}>
    {'Likes: '}{likes()}
  </button>
}
