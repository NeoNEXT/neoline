import { Component, Input } from '@angular/core';

@Component({
  selector: 'loading-dot',
  template: ` <div class="dot-spinner">
    <div class="dot-spinner__dot"></div>
    <div class="dot-spinner__dot"></div>
    <div class="dot-spinner__dot"></div>
    <div class="dot-spinner__dot"></div>
    <div class="dot-spinner__dot"></div>
    <div class="dot-spinner__dot"></div>
    <div class="dot-spinner__dot"></div>
    <div class="dot-spinner__dot"></div>
  </div>`,
  styleUrls: ['loading-dot.component.scss'],
})
export class LoadingDotComponent {
  @Input() color: string;
  @Input() width: number;

  constructor() {}
}
