import { makeStateKey } from '@angular/core';
import type { StateKey } from '@angular/core';
import type { DehydratedState } from '@tanstack/angular-query-experimental';

export const ANALOG_QUERY_STATE_KEY: StateKey<DehydratedState> =
  makeStateKey<DehydratedState>('analog_query_state');
