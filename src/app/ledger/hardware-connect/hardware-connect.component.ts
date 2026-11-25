import { Component, OnInit } from '@angular/core';
import { LedgerService, OneKeyService } from '@/app/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-hardware-connect',
  templateUrl: 'hardware-connect.component.html',
  styleUrls: ['hardware-connect.component.scss'],
})
export class HardwareConnectComponent implements OnInit {
  device: 'OneKey' | 'Ledger';
  connecting = false;
  authorized = false;
  error = '';

  get supported() {
    return this.device === 'OneKey'
      ? this.oneKeyService.supportsWebUsb
      : this.ledgerService.supportsWebHid;
  }

  constructor(
    private oneKeyService: OneKeyService,
    private ledgerService: LedgerService,
    route: ActivatedRoute
  ) {
    this.device = route.snapshot.queryParamMap.get('device') === 'OneKey'
      ? 'OneKey'
      : 'Ledger';
  }

  ngOnInit() {
    void this.connect();
  }

  async connect() {
    if (!this.supported || this.connecting || this.authorized) {
      return;
    }
    this.connecting = true;
    this.error = '';
    try {
      const device = await (this.device === 'OneKey'
        ? this.oneKeyService.requestDevice()
        : this.ledgerService.requestDevice());
      this.authorized = !!device;
    } catch (error) {
      if (error?.name !== 'NotFoundError' && error?.name !== 'SecurityError') {
        this.error = this.device === 'OneKey'
          ? 'oneKeyConnectionFailed'
          : 'ledgerConnectionFailed';
      }
    } finally {
      this.connecting = false;
    }
  }
}
