import { beforeEach, describe, expect, it, vi } from 'vitest';

const originalSetProjectAnnotationsMock = vi.fn((annotations) => annotations);
const renderMock = vi.fn();
const renderToCanvasMock = vi.fn();
const applyDecoratorsMock = vi.fn();

vi.mock('@storybook/angular/client', () => ({
  setProjectAnnotations: originalSetProjectAnnotationsMock,
}));

vi.mock('@storybook/angular/client/config', () => ({
  render: renderMock,
  renderToCanvas: renderToCanvasMock,
  applyDecorators: applyDecoratorsMock,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let setProjectAnnotations: any;

beforeEach(async () => {
  vi.resetModules();
  originalSetProjectAnnotationsMock.mockClear();
  const mod = await import('./testing');
  setProjectAnnotations = mod.setProjectAnnotations;
});

describe('setProjectAnnotations', () => {
  it('forwards applyDecorators from storybook angular config annotations', () => {
    const projectAnnotations = { decorators: [] };

    const result = setProjectAnnotations(projectAnnotations);

    expect(originalSetProjectAnnotationsMock).toHaveBeenCalledWith([
      expect.objectContaining({
        render: renderMock,
        renderToCanvas: expect.any(Function),
        applyDecorators: applyDecoratorsMock,
      }),
      projectAnnotations,
    ]);
    expect(result).toHaveLength(2);
  });
});
