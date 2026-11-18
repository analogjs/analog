import { defineEventHandler } from 'h3';

import { getProducts } from '../../../lib/products';

/** `GET /api/v1/products`: a Nitro API route consumed by the products pages. */
export default defineEventHandler(() => getProducts());
