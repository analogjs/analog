import { compileAnalogFile } from './analog';

const COMPONENT_CONTENT = `
<script lang="ts">
import { signal, input, ViewChild, afterNextRender, ElementRef, viewChild, viewChildren, contentChild, contentChildren } from '@angular/core';
import External from './external.analog' with { analog: 'imports' };
import { ExternalService } from './external' with { analog: 'providers' };
import { ExternalEnum } from './external.model' with { analog: 'exposes' };

defineMetadata({
  exposes: [Math],
  queries: {
    divElement: new ViewChild('divElement')
  }
});

export const routeMeta = {
  title: 'My page',
  canActivate: [() => true],
}

export interface MyInterface {
  title: string
}

export type MyType = string;

export enum Direction {
  Up,
  Down,
  Left,
  Right,
}

export function myFunc(){
  console.log('hello');
}

let divElement: ElementRef<HTMLDivElement>;
let test: string;

setTimeout(() => {
  test = 'test';
}, 1000)

const counter = signal(0);
const [a, b, , c = 4] = [1, 2, 3];

const inputWithDefault = input(""); // InputSignal<string, string>
const inputWithoutDefault = input<string>(); // InputSignal<string | undefined, string | undefined>
const inputWithAlias = input("", { alias: "theAlias" }); // InputSignal<string, string>
const inputWithoutDefaultWithAlias = input<string | undefined>(undefined, {
    alias: "theAlias",
  }); // InputSignal<string | undefined, string | undefined>
const inputWithTransform = input<unknown, boolean>("", {
    transform: booleanAttribute,
  }); // InputSignal<unknown, boolean>
const requiredInput = input.required<string>(); // InputSignal<string, string>
const requiredInputWithTransform = input.required<unknown, number>({
    transform: (value) => numberAttribute(value, 10),
  });
const output = new EventEmitter();
const outputWithType = new EventEmitter<string>();

const viewChildEl = viewChild<HTMLDivElement>('divElement');
const viewChildRequiredEl = viewChild.required<HTMLDivElement>('divElement');

const viewChildrenEl = viewChildren<HTMLDivElement[]>('divElement');

const contentChildEl = contentChild<ElementRef>('divElement');
const contentChildRequiredEl = contentChild.required<ElementRef>('divElement');

const contentChildrenEl = contentChildren<HTMLDivElement[]>('divElement');

afterNextRender(() => {
  console.log('the div', divElement);
})

</script>

<template>
  <div #divElement>Component</div>
  <p>{{ counter() }}</p>
  <p>{ a }</p>
  <p>{ b }</p>
  <p>{ c }</p>
  <p>{{ test }}</p>
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

defineMetadata({
  selector: 'input[directive]',
})

const elRef = inject(ElementRef);

afterNextRender(() => {
  elRef.nativeElement.focus();
});

onInit(() => {
  console.log('init code');
});

effect(() => {
  console.log('just some effect');
});
</script>
`;

const MARKDOWN_CONTENT = `
<template lang="md">
  # Hello World
</template>
`;

describe('authoring ng file', () => {
  it('should process component as an analog file', () => {
    const source = compileAnalogFile('virtual.analog.ts', COMPONENT_CONTENT);
    expect(source).toContain('Component');
    expect(source).toMatchSnapshot();
  });

  it('should process directive as an analog file', () => {
    const source = compileAnalogFile('virtual.analog.ts', DIRECTIVE_CONTENT);
    expect(source).toContain('Directive');
    expect(source).toMatchSnapshot();
  });

  it('should process component with markdown as analog file with a virtual templateUrl', () => {
    const source = compileAnalogFile('virtual.analog.ts', MARKDOWN_CONTENT);
    expect(source).toContain('Component');
    expect(source).toMatchSnapshot();
  });
});
