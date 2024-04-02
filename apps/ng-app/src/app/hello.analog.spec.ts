import { TestBed } from '@angular/core/testing';
import Hello from './hello.analog';

describe('Hello', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Hello],
    }).compileComponents();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(Hello);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
