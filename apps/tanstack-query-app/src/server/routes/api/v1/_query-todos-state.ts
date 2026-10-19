export type Todo = {
  id: string;
  title: string;
};

type ScopeState = {
  fetchCount: number;
  items: Todo[];
};

const scopes = new Map<string, ScopeState>();

export function getScopeState(scope: string): ScopeState {
  let state = scopes.get(scope);

  if (!state) {
    state = {
      fetchCount: 0,
      items: [{ id: '1', title: 'Read the Analog docs' }],
    };
    scopes.set(scope, state);
  }

  return state;
}
