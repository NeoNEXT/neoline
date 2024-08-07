import { Component, Input } from '@angular/core';

@Component({
  selector: 'evm-gas-error',
  templateUrl: './evm-gas-error.component.html',
  styleUrls: ['evm-gas-error.component.scss'],
})
export class EvmGasErrorComponent {
  @Input() networkName: string;
  @Input() symbol: string;

  constructor() {}
}
