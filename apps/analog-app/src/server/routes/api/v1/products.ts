import { defineEventHandler } from 'h3';

import { getProducts } from '../../../lib/products';

export default defineEventHandler(() => getProducts());
