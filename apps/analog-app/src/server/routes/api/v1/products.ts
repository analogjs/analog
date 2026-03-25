import { defineHandler } from 'nitro/h3';

import { getProducts } from '../../../lib/products';

export default defineHandler(() => getProducts());
