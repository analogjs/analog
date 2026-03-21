import { Component, input } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { MdcRendererDirective } from './mdc-renderer.directive';
import { MDC_COMPONENTS } from './mdc-component-registry';

@Component({
  selector: 'test-alert',
  standalone: true,
  template: '<div class="alert" [attr.data-type]="type()"><ng-content /></div>',
})
class TestAlertComponent {
  type = input<string>('info');
}

@Component({
  standalone: true,
  imports: [MdcRendererDirective],
  template: '<div [mdcAst]="ast"></div>',
})
class TestHostComponent {
  ast: { nodes: unknown[] } | null = null;
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
    host.ast = {
      nodes: [['p', {}, 'Hello world']],
    };
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('p')?.textContent).toBe('Hello world');
  });

  it('renders text nodes', async () => {
    host.ast = {
      nodes: ['Just text'],
    };
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Just text');
  });

  it('renders nested HTML elements', async () => {
    host.ast = {
      nodes: [['div', { class: 'wrapper' }, ['strong', {}, 'Bold text']]],
    };
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const div = el.querySelector('div.wrapper');
    expect(div).toBeTruthy();
    expect(div?.querySelector('strong')?.textContent).toBe('Bold text');
  });

  it('renders registered MDC components', async () => {
    host.ast = {
      nodes: [['alert', { type: 'warning' }, 'Watch out!']],
    };
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    // The component is instantiated and rendered
    const alertHost = el.querySelector('test-alert');
    expect(alertHost).toBeTruthy();
  });

  it('falls back to HTML element for unregistered components', async () => {
    host.ast = {
      nodes: [['custom-unknown', { id: 'test' }, 'Content']],
    };
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const custom = el.querySelector('custom-unknown');
    expect(custom).toBeTruthy();
    expect(custom?.getAttribute('id')).toBe('test');
    expect(custom?.textContent).toBe('Content');
  });

  it('handles null AST', async () => {
    host.ast = null;
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const container = el.querySelector('[mdcAst]');
    expect(container?.innerHTML?.trim() || '').toBe('');
  });

  it('handles empty nodes array', async () => {
    host.ast = { nodes: [] };
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const container = el.querySelector('[mdcAst]');
    expect(container?.innerHTML?.trim() || '').toBe('');
  });

  it('handles null tag nodes (fragment wrappers)', async () => {
    host.ast = {
      nodes: [[null, {}, 'Unwrapped text']],
    };
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Unwrapped text');
  });

  it('renders HTML attributes on fallback elements', async () => {
    host.ast = {
      nodes: [
        ['a', { href: 'https://analogjs.org', target: '_blank' }, 'Analog'],
      ],
    };
    fixture.detectChanges();
    await fixture.whenStable();

    const link = (fixture.nativeElement as HTMLElement).querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://analogjs.org');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.textContent).toBe('Analog');
  });

  it('clears host innerHTML on AST change', async () => {
    host.ast = { nodes: [['p', {}, 'First']] };
    fixture.detectChanges();
    await fixture.whenStable();

    // Trigger a change — the synchronous part of ngOnChanges clears innerHTML
    host.ast = { nodes: [] };
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const container = el.querySelector('[mdcAst]');
    expect(container?.innerHTML?.trim() || '').toBe('');
  });

  it('works without MDC_COMPONENTS provider', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TestHostComponent, MdcRendererDirective],
    });
    const f = TestBed.createComponent(TestHostComponent);
    f.componentInstance.ast = {
      nodes: [['div', {}, 'No registry']],
    };
    f.detectChanges();
    await f.whenStable();

    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('div')?.textContent).toBe('No registry');
  });
});
