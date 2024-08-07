import { Component } from '@angular/core';
import { CommonModule, NgIf } from '@angular/common';
import { MatCard, MatCardModule } from '@angular/material/card';

@Component({
  selector: 'lib-card',
  standalone: true,
  imports: [NgIf, MatCard],
  templateUrl: './card.component.html',
  styleUrls: ['./card.component.css'],
})
export class CardComponent {
  title = 'card-works';
  render = false;
}
