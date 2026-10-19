import { defineEventHandler } from 'h3';

import { getServices } from '../../../lib/services';

export default defineEventHandler(() => getServices());
