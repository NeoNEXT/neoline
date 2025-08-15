import {
  Component,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { Html5Qrcode } from 'html5-qrcode';
import { EvmService } from '@/app/core';

@Component({
  selector: 'app-scan-qrcode',
  templateUrl: 'scan-qrcode.dialog.html',
  styleUrls: ['scan-qrcode.dialog.scss'],
})
export class ScanQRCodeComponent implements OnInit, OnDestroy {
  scanner: Html5Qrcode;
  @Output() emitQrCode = new EventEmitter();

  errorMsg = '';
  constructor(private evmService: EvmService) {}
  ngOnInit(): void {
    Html5Qrcode.getCameras().then((devices) => {
      if (devices && devices.length) {
        var cameraId = devices[0].id;
        this.scanner = new Html5Qrcode('reader');
        this.scanner.start(
          cameraId,
          {
            fps: 10,
            qrbox: { width: 300, height: 300 },
          },
          (decodedText) => {
            const qrCodeData =
              this.evmService.getPublicKeyFromQRCode(decodedText);
            if (qrCodeData) {
              this.scanner.stop();
              this.emitQrCode.emit(qrCodeData);
            } else {
              this.errorMsg = 'Invalid QR Code';
            }
          },
          (errorMessage) => {
            this.errorMsg = errorMessage;
          }
        );
      }
    });
  }

  ngOnDestroy(): void {
    this.scanner?.clear();
  }
}
