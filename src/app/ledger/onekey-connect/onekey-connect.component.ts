import { Component, OnInit } from '@angular/core';
import { OneKeyService } from '@/app/core';

@Component({
  selector: 'app-onekey-connect',
  templateUrl: 'onekey-connect.component.html',
  styleUrls: ['onekey-connect.component.scss'],
})
export class OneKeyConnectComponent implements OnInit {
  connecting = false;
  authorized = false;
  error = '';

  get oneKeySupported() {
    return this.oneKeyService.supportsWebUsb;
  }

  constructor(private oneKeyService: OneKeyService) {}

  ngOnInit() {
    void this.connect();
  }

  async connect() {
    if (!this.oneKeySupported || this.connecting || this.authorized) {
      return;
    }
    this.connecting = true;
    this.error = '';
    try {
      await this.oneKeyService.requestDevice();
      this.authorized = true;
    } catch (error) {
      if (error?.name !== 'NotFoundError' && error?.name !== 'SecurityError') {
        this.error = 'oneKeyConnectionFailed';
      }
    } finally {
      this.connecting = false;
    }
  }
}
