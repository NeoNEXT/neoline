import { Component, Input } from '@angular/core';

@Component({
  selector: 'copy',
  templateUrl: 'copy.component.html',
  styleUrls: ['copy.component.scss'],
})
export class CopyComponent {
  @Input() value: string;

  isShowPopup = false;
  private showPopupTimeout: any;
  hasCopied = false;
  constructor() {}

  copy() {
    try {
      navigator.clipboard.writeText(this.value).then(() => {
        this.hasCopied = true;
      });
    } catch (error) {
      console.error('Failed to copy: ', error);
    }
  }

  showPopup(): void {
    clearTimeout(this.showPopupTimeout);
    this.isShowPopup = true;
  }

  hiddenPopup(): void {
    this.showPopupTimeout = setTimeout(() => {
      this.hasCopied = false;
      this.isShowPopup = false;
    }, 200);
  }
}
