// Under `@defer (hydrate never)`, this renders on the server and its code is
// never loaded in the browser.
export function ServerNote() @{
  <p id="server-note">{'Rendered on the server and never hydrated.'}</p>
}
