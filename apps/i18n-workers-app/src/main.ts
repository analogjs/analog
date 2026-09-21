import '@angular/localize/init';
import { loadTranslations } from '@angular/localize';
import { bootstrapApplication } from '@angular/platform-browser';
import load from './i18n';

async function bootstrap() {
  // Match the server's initialization order for module-level translations.
  if (window.location.pathname.split('/')[1] === 'en') {
    loadTranslations(await load('en'));
  }
  const [{ App }, { appConfig }] = await Promise.all([
    import('./app/app'),
    import('./app/app.config'),
  ]);
  await bootstrapApplication(App, appConfig);
}

void bootstrap();
