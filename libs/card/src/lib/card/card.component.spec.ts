import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatCardHarness } from '@angular/material/card/testing';

import { CardComponent } from './card.component';

describe('CardComponent', () => {
  let loader: HarnessLoader;
  let fixture: ComponentFixture<CardComponent>;
  let component: CardComponent;

  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [CardComponent],
    })
  );

  beforeEach(() => {
    fixture = TestBed.createComponent(CardComponent);
    component = fixture.componentInstance;
    loader = TestbedHarnessEnvironment.loader(fixture);
    fixture.detectChanges();
  });

  it('should show a card once we click on the button', async () => {
    const button = await loader.getHarness(MatButtonHarness);

    const card = await loader.getHarnessOrNull(MatCardHarness);
    expect(card).toBeNull();

    await button.click();

    const cardAfterClick = await loader.getHarnessOrNull(MatCardHarness);
    expect(cardAfterClick).not.toBeNull();
  });

  it('should create the app', () => {
    expect(component).toBeTruthy();
  });

  it(`should have as title 'vitetest'`, () => {
    expect(component.title).toEqual('card-works');
  });

  it('should create the app', () => {
    expect(fixture).toMatchSnapshot();
  });
});
