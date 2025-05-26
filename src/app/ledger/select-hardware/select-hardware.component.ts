import { Component, Output, EventEmitter } from '@angular/core';
import { HardwareDevice } from '@/app/popup/_lib';

@Component({
  selector: 'app-select-hardware',
  templateUrl: 'select-hardware.component.html',
  styleUrls: ['select-hardware.component.scss'],
})
export class LedgerDeviceComponent {
  @Output() selectDevice = new EventEmitter<HardwareDevice>();
  device: HardwareDevice = 'Ledger';

  constructor() {}

  select() {
    this.selectDevice.emit(this.device);
  }
}
