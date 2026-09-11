import { createError, eventHandler, getQuery } from 'h3';

export default eventHandler(async (event) => {
  const { section, fail } = getQuery(event);
  await new Promise((resolve) =>
    setTimeout(resolve, section === 'profile' ? 200 : 1200),
  );
  if (fail === 'true') {
    throw createError({
      statusCode: 503,
      statusMessage: 'Activity unavailable',
    });
  }
  return {
    label: section === 'profile' ? 'Ada Lovelace' : 'Three recent updates',
  };
});
