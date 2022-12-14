import { Component } from '@angular/core';
import { TransferData } from './interface';

@Component({
  templateUrl: 'create.component.html',
  styleUrls: ['create.component.scss'],
})
export class TransferCreateComponent {
  showConfirmPage = false;
  transferData: TransferData;

  constructor() {}

  toConfirmPage(data: TransferData) {
    this.transferData = data;
    this.showConfirmPage = true;
  }
}
