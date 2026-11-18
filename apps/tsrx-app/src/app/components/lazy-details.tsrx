// Only used inside @defer, so it is split into its own chunk and loaded lazily.
export function LazyDetails() @{
  <p id="details">{'These details were loaded on interaction.'}</p>
}
