// @vitest-environment jsdom
import '@angular/compiler';
import { Component, EventEmitter, output } from '@angular/core';
import client from './client';

// JIT can't see `output()` calls, so the metadata declares them as AOT would.
const SignalOutputComponent = Component({
  selector: 'app-signal-output',
  template: `<button (click)="saved.emit(label)">{{ label }}</button>`,
  inputs: [{ name: 'label', alias: 'text' }],
  outputs: ['saved'],
})(
  class SignalOutputComponent {
    label = '';
    saved = output<string>();
  },
);

const AliasedOutputComponent = Component({
  selector: 'app-aliased-output',
  template: `<button (click)="valueChange.emit(1)">Change</button>`,
  outputs: ['valueChange: changed'],
})(
  class AliasedOutputComponent {
    valueChange = new EventEmitter<number>();
  },
);

async function mount(
  component: Parameters<ReturnType<typeof client>>[0],
  props: Record<string, unknown>,
) {
  const island = document.createElement('astro-island');
  document.body.appendChild(island);
  const appRef = await client(island)(component, props);

  return { island, appRef };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('client', () => {
  it('should bind aliased inputs and forward signal outputs as events', async () => {
    const { island } = await mount(SignalOutputComponent, {
      text: 'Save',
      'data-analog-id': 'signal-1',
    });
    const listener = vi.fn();
    island.addEventListener('saved', listener);

    island.querySelector('button')!.click();

    expect(island.getAttribute('data-analog-id')).toBe('signal-1');
    expect(island.textContent).toContain('Save');
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].detail).toBe('Save');
  });

  it('should forward aliased outputs under their public name', async () => {
    const { island } = await mount(AliasedOutputComponent, {
      'data-analog-id': 'aliased-1',
    });
    const listener = vi.fn();
    island.addEventListener('changed', listener);

    island.querySelector('button')!.click();

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].detail).toBe(1);
  });
});
