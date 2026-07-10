import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { Image } from './image.component';
import { provideImageLoader } from './image-loader';

@Component({
  imports: [Image],
  template: `<Image src="/images/hero.png" width="1200" height="630" />`,
})
class HostComponent {}

@Component({
  imports: [Image],
  template: `<Image src="/images/bg.png" fill priority />`,
})
class FillHostComponent {}

function render(host: any): HTMLElement {
  TestBed.configureTestingModule({
    providers: [provideImageLoader()],
  });
  const fixture = TestBed.createComponent(host);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Image component', () => {
  it('renders an img through the analog image loader', () => {
    const element = render(HostComponent);
    const img = element.querySelector('img');

    expect(img).toBeTruthy();
    expect(img!.getAttribute('src')).toBe('/api/_image/_/images/hero.png');
    expect(img!.getAttribute('srcset')).toContain('w_1200/images/hero.png 1x');
    expect(img!.getAttribute('srcset')).toContain('w_2400/images/hero.png 2x');
    expect(img!.getAttribute('width')).toBe('1200');
    expect(img!.getAttribute('height')).toBe('630');
    expect(img!.getAttribute('loading')).toBe('lazy');
  });

  it('generates no layout box for the host element', () => {
    const element = render(HostComponent);
    const host = element.querySelector('Image') as HTMLElement;

    expect(host.style.display).toBe('contents');
  });

  it('supports fill mode with priority', () => {
    const element = render(FillHostComponent);
    const img = element.querySelector('img');

    expect(img!.getAttribute('fetchpriority')).toBe('high');
    expect(img!.getAttribute('loading')).toBe('eager');
    expect(img!.style.position).toBe('absolute');
  });
});
