import { eventHandler } from 'h3';

// Simulate a slow data source (~600ms) so Block B's `httpResource` keeps the
// app unstable until it resolves. This is a genuine per-request delay: the head
// and Block A stream immediately while the authoritative, data-filled document
// is flushed only once this resolves.
export default eventHandler(async () => {
  await new Promise((resolve) => setTimeout(resolve, 600));
  return { label: 'summer' };
});
