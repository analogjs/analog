import { Component, EventEmitter, Output } from '@angular/core';
import { defaultDecorateStory } from 'storybook/preview-api';
import { describe, expect, it, vi } from 'vitest';
import { componentWrapperDecorator } from './component-wrapper-decorator';

describe('componentWrapperDecorator', () => {
  it('prepares the base story template before wrapping portable stories', () => {
    class DemoComponent {}

    Component({
      selector: 'demo-component',
      standalone: true,
      template: '<button>demo</button>',
    })(DemoComponent);

    const decoratedStory = defaultDecorateStory(
      (context) => ({
        component: DemoComponent,
        props: context.args,
      }),
      [
        componentWrapperDecorator(
          (story) => `<wrapper-shell>${story}</wrapper-shell>`,
        ),
      ],
    );

    const result = decoratedStory(createStoryContext(DemoComponent));

    expect(result.template).toBe(
      '<wrapper-shell><demo-component></demo-component></wrapper-shell>',
    );
  });

  it('preserves output bindings when wrapping stories in portable tests', () => {
    class DemoComponent {
      btnClicked = new EventEmitter<void>();
    }

    Component({
      selector: 'demo-component',
      standalone: true,
      template: '<button>demo</button>',
    })(DemoComponent);
    Output()(DemoComponent.prototype, 'btnClicked');

    const clickHandler = vi.fn();
    const decoratedStory = defaultDecorateStory(
      (context) => ({
        component: DemoComponent,
        props: context.args,
      }),
      [componentWrapperDecorator((story) => story)],
    );

    const result = decoratedStory(
      createStoryContext(DemoComponent, {
        btnClicked: clickHandler,
      }),
    );

    expect(result.props?.btnClicked).toBe(clickHandler);
    expect(result.template).toContain('(btnClicked)="btnClicked($event)"');
  });
});

function createStoryContext(
  component: unknown,
  args: Record<string, unknown> = {},
) {
  return {
    args,
    argTypes: {},
    component,
    globals: {},
    hooks: {},
    id: 'demo--default',
    initialArgs: args,
    kind: 'Demo',
    name: 'Default',
    parameters: {},
    viewMode: 'story',
  };
}
