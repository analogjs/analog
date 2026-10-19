import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'analogjs-storybook-button',
  standalone: true,
  imports: [CommonModule],
  template: ` <button
    type="button"
    (click)="clicked.emit($event)"
    [ngClass]="classes"
    [ngStyle]="{ 'background-color': backgroundColor }"
  >
    {{ label }}
  </button>`,
  styles: [
    `
      .storybook-button {
        font-family:
          'Nunito Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-weight: 700;
        border: 0;
        border-radius: 3em;
        cursor: pointer;
        display: inline-block;
        line-height: 1;
      }

      .storybook-button--primary {
        color: white;
        background-color: #1ea7fd;
      }

      .storybook-button--secondary {
        color: #333;
        background-color: transparent;
        box-shadow: rgba(0, 0, 0, 0.15) 0px 0px 0px 1px inset;
      }

      .storybook-button--small {
        font-size: 12px;
        padding: 10px 16px;
      }

      .storybook-button--medium {
        font-size: 14px;
        padding: 11px 20px;
      }

      .storybook-button--large {
        font-size: 16px;
        padding: 12px 24px;
      }
    `,
  ],
})
export class ButtonComponent {
  /**
   * Is this the principal call to action on the page?
   */
  @Input()
  primary = false;

  /**
   * What background color to use
   */
  @Input()
  backgroundColor?: string;

  /**
   * How large should the button be?
   */
  @Input()
  size: 'small' | 'medium' | 'large' = 'medium';

  /**
   * Button contents
   *
   * @required
   */
  @Input()
  label = 'Button';

  /**
   * Optional click handler
   */
  @Output()
  clicked = new EventEmitter<Event>();

  public get classes(): string[] {
    const mode = this.primary
      ? 'storybook-button--primary'
      : 'storybook-button--secondary';

    return ['storybook-button', `storybook-button--${this.size}`, mode];
  }
}
