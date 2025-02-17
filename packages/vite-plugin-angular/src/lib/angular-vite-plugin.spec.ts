import { describe, it, expect } from 'vitest';
import { angular, isTestWatchMode } from './angular-vite-plugin';

describe('angularVitePlugin', () => {
  it('should work', () => {
    expect(angular()[0].name).toEqual('@analogjs/vite-plugin-angular');
  });
});

describe('isTestWatchMode', () => {
  it('should return false for vitest --run', () => {
    const result = isTestWatchMode(['--run']);

    expect(result).toBeFalsy();
  });

  it('should return true for vitest --no-run', () => {
    const result = isTestWatchMode(['--no-run']);

    expect(result).toBeTruthy();
  });

  it('should return true for vitest --watch', () => {
    const result = isTestWatchMode(['--watch']);

    expect(result).toBeTruthy();
  });

  it('should return true for vitest watch', () => {
    const result = isTestWatchMode(['watch']);

    expect(result).toBeTruthy();
  });

  it('should return false for vitest --no-watch', () => {
    const result = isTestWatchMode(['--no-watch']);

    expect(result).toBeFalsy();
  });

  it('should return false for vitest --watch=false', () => {
    const result = isTestWatchMode(['--watch=false']);

    expect(result).toBeFalsy();
  });

  it('should return false for vitest --watch false', () => {
    const result = isTestWatchMode(['--watch', 'false']);

    expect(result).toBeFalsy();
  });
});
