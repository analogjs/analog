import { describe, expect, it, vi } from 'vitest';
import {
  isTranslationFile,
  registerI18nWatcher,
} from './register-i18n-watcher';

describe('isTranslationFile', () => {
  it('should match JSON files in i18n directories', () => {
    expect(isTranslationFile('src/i18n/en.json')).toBe(true);
    expect(isTranslationFile('src/i18n/fr.json')).toBe(true);
    expect(isTranslationFile('/abs/path/src/i18n/messages.json')).toBe(true);
  });

  it('should match XLIFF files in i18n directories', () => {
    expect(isTranslationFile('src/i18n/messages.xlf')).toBe(true);
  });

  it('should match XMB files in i18n directories', () => {
    expect(isTranslationFile('src/i18n/messages.xmb')).toBe(true);
  });

  it('should match ARB files in i18n directories', () => {
    expect(isTranslationFile('src/i18n/intl_fr.arb')).toBe(true);
  });

  it('should not match non-translation files', () => {
    expect(isTranslationFile('src/app/component.ts')).toBe(false);
    expect(isTranslationFile('src/app/data.json')).toBe(false);
    expect(isTranslationFile('package.json')).toBe(false);
  });

  it('should not match translation-like files outside i18n directories', () => {
    expect(isTranslationFile('src/assets/config.json')).toBe(false);
  });
});

describe('registerI18nWatcher', () => {
  it('should register change and add listeners on the watcher', () => {
    const on = vi.fn();
    const viteServer = {
      watcher: { on },
      ws: { send: vi.fn() },
    } as any;

    registerI18nWatcher(viteServer);

    expect(on).toHaveBeenCalledWith('change', expect.any(Function));
    expect(on).toHaveBeenCalledWith('add', expect.any(Function));
  });

  it('should trigger full-reload when a translation file changes', () => {
    const listeners: Record<string, Function> = {};
    const on = vi.fn((event: string, fn: Function) => {
      listeners[event] = fn;
    });
    const send = vi.fn();
    const viteServer = {
      watcher: { on },
      ws: { send },
    } as any;

    registerI18nWatcher(viteServer);
    listeners['change']('src/i18n/fr.json');

    expect(send).toHaveBeenCalledWith({ type: 'full-reload' });
  });

  it('should not trigger reload for non-translation files', () => {
    const listeners: Record<string, Function> = {};
    const on = vi.fn((event: string, fn: Function) => {
      listeners[event] = fn;
    });
    const send = vi.fn();
    const viteServer = {
      watcher: { on },
      ws: { send },
    } as any;

    registerI18nWatcher(viteServer);
    listeners['change']('src/app/component.ts');

    expect(send).not.toHaveBeenCalled();
  });
});
