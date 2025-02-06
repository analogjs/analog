import { describe, it, expect } from 'vitest';
import { angular, isTestWatchMode } from './angular-vite-plugin';

describe('angularVitePlugin', () => {
  it('should work', () => {
    expect(angular()[0].name).toEqual('@analogjs/vite-plugin-angular');
  });
});

describe('isTestWatchMode', () => {
  it('should return false if vitest command not included in the command', () => {
    const result = isTestWatchMode('vite');

    expect(result).toBeFalsy();
  });

  it('should return false for vitest --run', () => {
    const result = isTestWatchMode('vitest', ['--run']);

    expect(result).toBeFalsy();
  });

  it('should return true for vitest --no-run', () => {
    const result = isTestWatchMode('vitest', ['--no-run']);

    expect(result).toBeTruthy();
  });

  it('should return true for vitest --watch', () => {
    const result = isTestWatchMode('vitest', ['--watch']);

    expect(result).toBeTruthy();
  });

  it('should return true for vitest watch', () => {
    const result = isTestWatchMode('vitest', ['watch']);

    expect(result).toBeTruthy();
  });

  it('should return false for vitest --no-watch', () => {
    const result = isTestWatchMode('vitest', ['--no-watch']);

    expect(result).toBeFalsy();
  });

  it('should return false for vitest --watch=false', () => {
    const result = isTestWatchMode('vitest', ['--watch=false']);

    expect(result).toBeFalsy();
  });

  it('should return false for vitest --watch false', () => {
    const result = isTestWatchMode('vitest', ['--watch', 'false']);

    expect(result).toBeFalsy();
  });
});
