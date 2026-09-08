/** Test-only assertion of fixture presence before inspecting a nested value. */
export function required<A>(value: A | undefined): A {
  if (value === undefined)
    throw new Error('Expected the fixture value to be present');
  return value;
}

export function hook<H extends (...args: never[]) => unknown>(
  value: H | { handler: H } | undefined,
): H {
  const present = required(value);
  return typeof present === 'function' ? present : present.handler;
}
