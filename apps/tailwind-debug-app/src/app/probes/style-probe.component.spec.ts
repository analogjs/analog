import { TestBed } from '@angular/core/testing';
import { StyleProbeComponent } from './style-probe.component';

describe('StyleProbeComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StyleProbeComponent],
    }).compileComponents();
  });

  it('renders the probe shell', () => {
    const fixture = TestBed.createComponent(StyleProbeComponent);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="probe-card"]'),
    ).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain(
      'Tailwind-prefixed CSS HMR probe',
    );
  });

  it('increments and displays click count', () => {
    const fixture = TestBed.createComponent(StyleProbeComponent);
    fixture.componentInstance.increment();
    fixture.detectChanges();

    expect(
      fixture.nativeElement
        .querySelector('[data-testid="probe-counter"]')
        ?.textContent?.trim(),
    ).toContain('Clicks 1');
  });
});
