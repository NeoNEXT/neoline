import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { Html5Qrcode } from 'html5-qrcode';
import { EvmService } from '@/app/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { EvmWalletJSON } from '../../_lib';

declare var QRCode: any;

@Component({
  templateUrl: 'qr-based-sign.dialog.html',
  styleUrls: ['qr-based-sign.dialog.scss'],
})
export class PopupQRBasedSignDialogComponent implements OnInit, OnDestroy {
  scanner: Html5Qrcode;
  isScanning = false;
  isValidQRCode = true;
  loadingScanner = true;

  constructor(
    private evmService: EvmService,
    private dialogRef: MatDialogRef<PopupQRBasedSignDialogComponent>,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      unsignedTx: any;
      currentWallet: EvmWalletJSON;
    }
  ) {}
  ngOnInit(): void {
    if (QRCode) {
      const qrCode = new QRCode('popup-tx-qrcode', {
        text: this.evmService.generateSignRequest({
          tx: this.data.unsignedTx,
          wallet: this.data.currentWallet,
        }),
        width: 214,
        height: 214,
        colorDark: '#000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H,
      });
    }
  }

  ngOnDestroy(): void {
    this.scanner?.stop().then(() => {
      this.scanner?.clear();
    });
  }

  public cancel() {
    this.dialogRef.close();
  }

  confirm() {
    if (!this.isScanning) {
      this.getSignature();
    } else {
      this.dialogRef.close();
    }
  }

  private getSignature() {
    this.isScanning = true;
    Html5Qrcode.getCameras().then((devices) => {
      if (devices && devices.length) {
        var cameraId = devices[0].id;
        this.scanner = new Html5Qrcode('reader');
        this.loadingScanner = false;
        this.scanner.start(
          cameraId,
          {
            fps: 10,
            qrbox: { width: 300, height: 250 },
          },
          (decodedText) => {
            try {
              const qrCodeData =
                this.evmService.getSignDataFromQRCode(decodedText);
              this.dialogRef.close({
                ...this.data.unsignedTx,
                signature: qrCodeData,
              });
            } catch {
              this.isValidQRCode = false;
            }
          },
          () => {}
        );
      }
    });
  }
}
