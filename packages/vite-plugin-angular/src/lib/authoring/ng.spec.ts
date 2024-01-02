import { processNgFile } from './ng';

const COMPONENT_CONTENT = `
<script lang="ts">
import { signal } from '@angular/core';

const counter = signal(0);
</script>

<template>
  <div>Component</div>
  <p>{{ counter() }}</p>
</template>

<style>
  div {
    color: red;
  }

  p {
    color: blue;
  }
</style>
`;

const DIRECTIVE_CONTENT = `
<script lang="ts">
import { inject, ElementRef,afterNextRender } from '@angular/core';

defineDirectiveMetadata({
  selector: 'input[directive]',
})

const elRef = inject(ElementRef);

afterNextRender(() => {
  elRef.nativeElement.focus();
});
</script>
`;

const PIPE_CONTENT = `
<script lang="ts">
definePipeMetadata({
  name: 'doubled',
})

function transform(value: number) {
  return value * 2;
}
</script>
`;

describe('authoring ng file', () => {
  it('should process component as ng file', () => {
    const source = processNgFile('virtual.ng.ts', COMPONENT_CONTENT);
    expect(source).toContain('Component');
    expect(source).toMatchSnapshot();
  });

  it('should process directive as ng file', () => {
    const source = processNgFile('virtual.ng.ts', DIRECTIVE_CONTENT);
    expect(source).toContain('Directive');
    expect(source).toMatchSnapshot();
  });

  it('should process pipe as ng file', () => {
    const source = processNgFile('virtual.ng.ts', PIPE_CONTENT);
    expect(source).toContain('Pipe');
    expect(source).toMatchSnapshot();
  });
});
