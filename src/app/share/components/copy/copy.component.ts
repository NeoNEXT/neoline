import { Component, Input } from '@angular/core';

@Component({
  selector: 'copy',
  templateUrl: 'copy.component.html',
  styleUrls: ['copy.component.scss'],
})
export class CopyComponent {
  @Input() value: string;

  isShowPopup = false;
  showPopupTimeout: any;
  hasCopied = false;
  constructor() {}

  copy() {
    const input = document.createElement('input');
    input.setAttribute('readonly', 'readonly');
    input.setAttribute('value', this.value);
    document.body.appendChild(input);
    input.select();
    if (document.execCommand('copy')) {
      document.execCommand('copy');
    }
    document.body.removeChild(input);
    this.hasCopied = true;
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
