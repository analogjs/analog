import type { PageServerLoad } from '@analogjs/router';

import { findOrg } from '../../data';

export const load = async ({ params }: PageServerLoad) => ({
  teamCount: findOrg(params?.['orgId'] ?? null)?.teams.length ?? 0,
});
