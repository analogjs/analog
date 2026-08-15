import { defineEventHandler, getRouterParam } from 'h3';

export default defineEventHandler((event) => ({
  id: getRouterParam(event, 'id'),
}));
