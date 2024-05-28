import { Component, Input } from '@angular/core';

@Component({
  selector: 'tooltip',
  templateUrl: 'tooltip.component.html',
  styleUrls: ['tooltip.component.scss'],
})
export class TooltipComponent {
  @Input() tip: string;

  isShowPopup = false;
  private showPopupTimeout: any;
  constructor() {}

  showPopup(): void {
    clearTimeout(this.showPopupTimeout);
    this.isShowPopup = true;
  }

  hiddenPopup(): void {
    this.showPopupTimeout = setTimeout(() => {
      this.isShowPopup = false;
    }, 200);
  }
}
