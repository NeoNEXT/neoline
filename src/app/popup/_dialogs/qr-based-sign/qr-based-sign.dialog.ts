import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { Html5Qrcode } from 'html5-qrcode';
import { QRBasedService } from '@/app/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { EvmWalletJSON } from '../../_lib';
import { ETH_EOA_SIGN_METHODS } from '@/models/evm';
import { ethers } from 'ethers';
import { interval } from 'rxjs';

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
    private qrBasedService: QRBasedService,
    private dialogRef: MatDialogRef<PopupQRBasedSignDialogComponent>,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      unsignedTx: any;
      unsignedData: any;
      currentWallet: EvmWalletJSON;
      signMethod:
        | ETH_EOA_SIGN_METHODS.PersonalSign
        | ETH_EOA_SIGN_METHODS.SignTypedDataV4
        | undefined;
    }
  ) {}
  ngOnInit(): void {
    if (QRCode) {
      const parts = this.qrBasedService.generateSignRequest({
        signMethod: this.data.signMethod,
        tx: this.data.unsignedTx,
        personalMessage: this.data.unsignedData,
        typedData: this.data.unsignedData,
        wallet: this.data.currentWallet,
      });
      const qrCode = new QRCode('popup-tx-qrcode', {
        text: parts[0],
        width: 214,
        height: 214,
        colorDark: '#000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.L,
      });
      interval(200).subscribe((i) => {
        const index = i % parts.length;
        qrCode.makeCode(parts[index]);
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
              const signData =
                this.qrBasedService.getSignDataFromQRCode(decodedText);
              switch (this.data.signMethod) {
                case ETH_EOA_SIGN_METHODS.PersonalSign:
                case ETH_EOA_SIGN_METHODS.SignTypedDataV4:
                  this.dialogRef.close(signData);
                  break;
                default:
                  const sig = ethers.Signature.from(signData);
                  this.dialogRef.close({
                    ...this.data.unsignedTx,
                    signature: {
                      r: sig.r,
                      s: sig.s,
                      v: '0x' + sig.v.toString(16),
                    },
                  });
                  break;
              }
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
