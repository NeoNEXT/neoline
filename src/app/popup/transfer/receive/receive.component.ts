import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NeonService, GlobalService } from '@/app/core';

declare var QRCode: any;

@Component({
  templateUrl: 'receive.component.html',
  styleUrls: ['receive.component.scss'],
})
export class TransferReceiveComponent implements OnInit {
  public address: string;
  constructor(
    private router: Router,
    private neon: NeonService,
    private global: GlobalService
  ) {}

  ngOnInit(): void {
    this.address = this.neon.address;
    if (QRCode) {
      setTimeout(() => {
        const qrcode = new QRCode('receive-qrcode', {
          text: this.address,
          width: 170,
          height: 170,
          colorDark: '#333333',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.H,
        });
      }, 0);
    }
  }

  public copied() {
    this.global.snackBarTip('copied');
  }
}
