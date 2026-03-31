import { Component } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { describe, beforeEach, it, expect } from 'vitest';

describe('Angular Fixture Snapshot', () => {
  @Component({
    selector: 'app-test',
    template: `
      <div>
        <a href="https://analogjs.org/" target="_blank">
          <img alt="Analog Logo" class="logo analog" src="/analog.svg" />
        </a>
      </div>

      <h2>Analog</h2>

      <h3>The fullstack meta-framework for Angular!</h3>

      <div class="card">
        <button type="button" (click)="increment()">Count {{ count }}</button>
      </div>

      <p class="read-the-docs">
        For guides on how to customize this project, visit the
        <a href="https://analogjs.org" target="_blank">Analog documentation</a>
      </p>
    `,
    styles: [
      `
        .logo {
          will-change: filter;
        }
        .logo:hover {
          filter: drop-shadow(0 0 2em #646cffaa);
        }
        .logo.angular:hover {
          filter: drop-shadow(0 0 2em #42b883aa);
        }
        .read-the-docs {
          color: #888;
        }
      `,
    ],
  })
  class TestComponent {
    count = 0;

    increment() {
      this.count++;
    }
  }

  let fixture: ComponentFixture<TestComponent>;
  let component: TestComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TestComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('create angular fixture snapshot', () => {
    expect(fixture).toMatchSnapshot();
  });

  it('create angular component componentRef fixture snapshot', () => {
    expect(fixture.componentRef).toMatchSnapshot();
  });
});
