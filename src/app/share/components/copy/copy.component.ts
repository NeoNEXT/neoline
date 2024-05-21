import { GlobalService } from '@/app/core';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'copy',
  templateUrl: 'copy.component.html',
  styleUrls: ['copy.component.scss'],
})
export class CopyComponent {
  @Input() value: string;
  @Input() showTip = true;

  isShowPopup = false;
  private showPopupTimeout: any;
  hasCopied = false;
  constructor(private globalService: GlobalService) {}

  copy() {
    try {
      navigator.clipboard.writeText(this.value).then(() => {
        this.hasCopied = true;
        if (this.showTip === false) {
          this.globalService.snackBarTip('copied');
        }
      });
    } catch (error) {
      console.error('Failed to copy: ', error);
    }
  }

  showPopup(): void {
    if (!this.showTip) return;
    clearTimeout(this.showPopupTimeout);
    this.isShowPopup = true;
  }

  hiddenPopup(): void {
    if (!this.showTip) return;
    this.showPopupTimeout = setTimeout(() => {
      this.hasCopied = false;
      this.isShowPopup = false;
    }, 200);
  }
}
