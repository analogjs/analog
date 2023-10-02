import { Component } from '@angular/core';
import { TestBed, ComponentFixture, waitForAsync } from '@angular/core/testing';

/**
 * @vitest-environment jsdom
 */
describe('Angular Fixture Snapshot', () => {
  @Component({
    selector: 'app-test',
    standalone: true,
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

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [TestComponent],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(TestComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('create angular fixture snapshot', () => {
    expect(fixture).toMatchSnapshot();
  });

  it('create angular component snapshot', () => {
    expect(component).toMatchSnapshot();
  });

  it('create angular fixture inline snapshot', () => {
    expect(fixture).toMatchInlineSnapshot(`
      <app-test>
        <div
          _ngcontent-a-c3752700837=""
        >
          <a
            _ngcontent-a-c3752700837=""
            href="https://analogjs.org/"
            target="_blank"
          >
            <img
              _ngcontent-a-c3752700837=""
              alt="Analog Logo"
              class="logo analog"
              src="/analog.svg"
            />
          </a>
        </div>
        <h2
          _ngcontent-a-c3752700837=""
        >
          Analog
        </h2>
        <h3
          _ngcontent-a-c3752700837=""
        >
          The fullstack meta-framework for Angular!
        </h3>
        <div
          _ngcontent-a-c3752700837=""
          class="card"
        >
          <button
            _ngcontent-a-c3752700837=""
            type="button"
          >
            Count 0
          </button>
        </div>
        <p
          _ngcontent-a-c3752700837=""
          class="read-the-docs"
        >
           For guides on how to customize this project, visit the 
          <a
            _ngcontent-a-c3752700837=""
            href="https://analogjs.org"
            target="_blank"
          >
            Analog documentation
          </a>
        </p>
      </app-test>
    `);
  });

  it('create angular component inline snapshot', () => {
    expect(component).toMatchInlineSnapshot(`
      TestComponent {
        "__ngContext__": 6,
        "count": 0,
      }
    `);
  });

  it('create angular component componentRef fixture inline snapshot', () => {
    expect(fixture.componentRef).toMatchInlineSnapshot(`
      <app-test>
        <div
          _ngcontent-a-c3752700837=""
        >
          <a
            _ngcontent-a-c3752700837=""
            href="https://analogjs.org/"
            target="_blank"
          >
            <img
              _ngcontent-a-c3752700837=""
              alt="Analog Logo"
              class="logo analog"
              src="/analog.svg"
            />
          </a>
        </div>
        <h2
          _ngcontent-a-c3752700837=""
        >
          Analog
        </h2>
        <h3
          _ngcontent-a-c3752700837=""
        >
          The fullstack meta-framework for Angular!
        </h3>
        <div
          _ngcontent-a-c3752700837=""
          class="card"
        >
          <button
            _ngcontent-a-c3752700837=""
            type="button"
          >
            Count 0
          </button>
        </div>
        <p
          _ngcontent-a-c3752700837=""
          class="read-the-docs"
        >
           For guides on how to customize this project, visit the 
          <a
            _ngcontent-a-c3752700837=""
            href="https://analogjs.org"
            target="_blank"
          >
            Analog documentation
          </a>
        </p>
      </app-test>
    `);
  });

  it('should contain "Analog"', () => {
    const bannerElement: HTMLElement = fixture.nativeElement;
    const h2 = bannerElement.querySelector('h2')!;
    expect(h2.textContent).toMatchInlineSnapshot('"Analog"');
  });

  it('should contain "read-the-docs"', () => {
    const bannerElement: HTMLElement = fixture.nativeElement;
    const p = bannerElement.querySelector('p')!;
    expect(p.className).toMatchInlineSnapshot('"read-the-docs"');
  });
});
