import { defineHandler } from 'nitro/h3';
import { probe } from '../../../app/probe';

export default defineHandler((event) => {
  const query = new URL(event.req.url).searchParams;
  const record = probe(query.get('id') ?? 'normal');
  if (query.get('release') === '1') record.release?.();
  return record;
});
