import { Component, input, signal } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { MdcRendererDirective } from './mdc-renderer.directive';
import { MDC_COMPONENTS } from './mdc-component-registry';

@Component({
  selector: 'analog-test-alert',
  standalone: true,
  template: '<div class="alert" [attr.data-type]="type()"><ng-content /></div>',
})
class TestAlertComponent {
  type = input<string>('info');
}

@Component({
  selector: 'analog-test-host',
  standalone: true,
  imports: [MdcRendererDirective],
  template: '<div [mdcAst]="ast()"></div>',
})
class TestHostComponent {
  ast = signal<{ nodes: unknown[] } | null>(null);
}

async function flushRendering(fixture: ComponentFixture<unknown>) {
  fixture.detectChanges();
  await fixture.whenStable();
  // The directive's effect fires a void async render — flush microtasks.
  await new Promise((r) => setTimeout(r));
  fixture.detectChanges();
}

describe('MdcRendererDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestHostComponent, TestAlertComponent, MdcRendererDirective],
      providers: [
        {
          provide: MDC_COMPONENTS,
          useValue: new Map([
            ['alert', () => Promise.resolve(TestAlertComponent)],
          ]),
        },
      ],
    });

    fixture = TestBed.createComponent(TestHostComponent);
    host = fixture.componentInstance;
  });

  it('renders plain HTML elements from AST', async () => {
    host.ast.set({
      nodes: [['p', {}, 'Hello world']],
    });
    await flushRendering(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('p')?.textContent).toBe('Hello world');
  });

  it('renders text nodes', async () => {
    host.ast.set({
      nodes: ['Just text'],
    });
    await flushRendering(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Just text');
  });

  it('renders nested HTML elements', async () => {
    host.ast.set({
      nodes: [['div', { class: 'wrapper' }, ['strong', {}, 'Bold text']]],
    });
    await flushRendering(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const div = el.querySelector('div.wrapper');
    expect(div).toBeTruthy();
    expect(div?.querySelector('strong')?.textContent).toBe('Bold text');
  });

  it('renders registered MDC components', async () => {
    host.ast.set({
      nodes: [['alert', { type: 'warning' }, 'Watch out!']],
    });
    await flushRendering(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const alertHost = el.querySelector('analog-test-alert');
    expect(alertHost).toBeTruthy();
  });

  it('falls back to HTML element for unregistered components', async () => {
    host.ast.set({
      nodes: [['custom-unknown', { id: 'test' }, 'Content']],
    });
    await flushRendering(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const custom = el.querySelector('custom-unknown');
    expect(custom).toBeTruthy();
    expect(custom?.getAttribute('id')).toBe('test');
    expect(custom?.textContent).toBe('Content');
  });

  it('handles null tag nodes (fragment wrappers)', async () => {
    host.ast.set({
      nodes: [[null, {}, 'Unwrapped text']],
    });
    await flushRendering(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Unwrapped text');
  });

  it('renders HTML attributes on fallback elements', async () => {
    host.ast.set({
      nodes: [
        ['a', { href: 'https://analogjs.org', target: '_blank' }, 'Analog'],
      ],
    });
    await flushRendering(fixture);

    const link = (fixture.nativeElement as HTMLElement).querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://analogjs.org');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.textContent).toBe('Analog');
  });

  it('clears previously rendered content when the AST becomes empty', async () => {
    host.ast.set({ nodes: [['p', {}, 'First']] });
    await flushRendering(fixture);

    const container = (fixture.nativeElement as HTMLElement).querySelector(
      'div',
    );
    expect(container?.innerHTML).toContain('First');

    host.ast.set({ nodes: [] });
    await flushRendering(fixture);

    expect(container?.innerHTML).toBe('');
  });

  it('clears previously rendered content when the AST becomes null', async () => {
    host.ast.set({ nodes: [['p', {}, 'First']] });
    await flushRendering(fixture);

    const container = (fixture.nativeElement as HTMLElement).querySelector(
      'div',
    );
    expect(container?.innerHTML).toContain('First');

    host.ast.set(null);
    await flushRendering(fixture);

    expect(container?.innerHTML).toBe('');
  });

  it('works without MDC_COMPONENTS provider', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TestHostComponent, MdcRendererDirective],
    });
    const f = TestBed.createComponent(TestHostComponent);
    f.componentInstance.ast.set({
      nodes: [['div', {}, 'No registry']],
    });
    await flushRendering(f);

    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('div')?.textContent).toBe('No registry');
  });
});
