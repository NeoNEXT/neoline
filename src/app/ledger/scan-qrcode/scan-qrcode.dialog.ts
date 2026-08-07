import {
  Component,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
// Type-only — the runtime value comes from the dynamic import() in ngOnInit so
// the ~1.2MB library is fetched only when the camera is actually opened. It
// shares one async chunk with _dialogs/qr-based-sign.
import type { Html5Qrcode as Html5QrcodeType } from 'html5-qrcode';
import { QRBasedService } from '@/app/core';

@Component({
  selector: 'app-scan-qrcode',
  templateUrl: 'scan-qrcode.dialog.html',
  styleUrls: ['scan-qrcode.dialog.scss'],
})
export class ScanQRCodeComponent implements OnInit, OnDestroy {
  @Output() emitQrCode = new EventEmitter();

  scanner: Html5QrcodeType;
  isValidQRCode = true;
  loadingScanner = true;
  cameraError = false;
  cameraPermission = true;

  constructor(private qrBasedService: QRBasedService) {}
  async ngOnInit(): Promise<void> {
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const devices = await Html5Qrcode.getCameras();
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
                this.qrBasedService.getPublicKeyFromQRCode(decodedText);
              this.emitQrCode.emit(qrCodeData);
            } catch {
              this.isValidQRCode = false;
            }
          },
          () => {}
        );
      }
    } catch (error) {
      this.cameraError = true;
      if (error.code === 0) {
        // NotAllowedError
        this.cameraPermission = false;
      }
    }
  }

  ngOnDestroy(): void {
    this.scanner?.stop().then(() => {
      this.scanner?.clear();
    });
  }
}
