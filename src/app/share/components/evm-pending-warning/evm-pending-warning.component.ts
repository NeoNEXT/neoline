import { Component, Input } from '@angular/core';

@Component({
  selector: 'evm-pending-warning',
  templateUrl: './evm-pending-warning.component.html',
  styleUrls: ['evm-pending-warning.component.scss'],
})
export class EvmPendingWarningComponent {
  @Input() count: number;

  constructor() {}
}
