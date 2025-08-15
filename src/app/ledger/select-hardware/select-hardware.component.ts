import { Component, Output, EventEmitter, Input } from '@angular/core';
import { HardwareDevice } from '@/app/popup/_lib';

@Component({
  selector: 'app-select-hardware',
  templateUrl: 'select-hardware.component.html',
  styleUrls: ['select-hardware.component.scss'],
})
export class LedgerDeviceComponent {
  @Input() device: HardwareDevice;
  @Output() selectDevice = new EventEmitter<HardwareDevice>();

  constructor() {}

  select() {
    this.selectDevice.emit(this.device);
  }
}
