import { beforeEach, describe, expect, it, vi } from 'vitest';

const originalSetProjectAnnotationsMock = vi.fn((annotations) => annotations);
const renderMock = vi.fn();
const renderToCanvasMock = vi.fn();

vi.mock('@storybook/angular/client', () => ({
  setProjectAnnotations: originalSetProjectAnnotationsMock,
}));

vi.mock('@storybook/angular/client/config', () => ({
  render: renderMock,
  renderToCanvas: renderToCanvasMock,
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
  it('keeps portable story annotations limited to render hooks', () => {
    const projectAnnotations = { decorators: [] };

    const result = setProjectAnnotations(projectAnnotations);
    const renderAnnotations =
      originalSetProjectAnnotationsMock.mock.calls[0][0][0];

    expect(originalSetProjectAnnotationsMock).toHaveBeenCalledWith([
      expect.objectContaining({
        render: renderMock,
        renderToCanvas: expect.any(Function),
      }),
      projectAnnotations,
    ]);
    expect(renderAnnotations).not.toHaveProperty('applyDecorators');
    expect(result).toHaveLength(2);
  });
});
