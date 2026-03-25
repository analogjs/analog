import { defineHandler } from 'nitro/h3';

import { getServices } from '../../../lib/services';

export default defineHandler(() => getServices());
