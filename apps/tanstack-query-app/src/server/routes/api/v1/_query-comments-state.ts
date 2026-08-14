export type Comment = {
  id: string;
  text: string;
  optimistic?: boolean;
};

type ScopeState = {
  fetchCount: number;
  items: Comment[];
};

const scopes = new Map<string, ScopeState>();

export function getScopeState(scope: string): ScopeState {
  let state = scopes.get(scope);

  if (!state) {
    state = {
      fetchCount: 0,
      items: Array.from({ length: 7 }, (_, i) => ({
        id: String(i + 1),
        text: `Comment ${i + 1}`,
      })),
    };
    scopes.set(scope, state);
  }

  return state;
}
