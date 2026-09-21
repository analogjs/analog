export default async function load(locale: string) {
  if (locale === 'en') return (await import('./i18n/en.json')).default;
  return {};
}
