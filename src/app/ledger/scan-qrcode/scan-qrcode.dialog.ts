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
  @Output() emitQrCode = new EventEmitter();

  scanner: Html5Qrcode;
  isValidQRCode = true;
  loadingScanner = true;

  constructor(private evmService: EvmService) {}
  ngOnInit(): void {
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
                this.evmService.getPublicKeyFromQRCode(decodedText);
              this.emitQrCode.emit(qrCodeData);
            } catch {
              this.isValidQRCode = false;
            }
          },
          () => {}
        );
      }
    });
  }

  ngOnDestroy(): void {
    this.scanner?.stop().then(() => {
      this.scanner?.clear();
    });
  }
}
