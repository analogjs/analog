import { defineEventHandler } from 'h3';

export default defineEventHandler((event) => ({
  context: event.context['analogTest'] ?? null,
}));
