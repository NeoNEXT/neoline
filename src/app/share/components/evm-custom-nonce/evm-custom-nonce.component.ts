import { SettingState } from '@/app/core';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'evm-custom-nonce',
  templateUrl: 'evm-custom-nonce.component.html',
  styleUrls: ['evm-custom-nonce.component.scss'],
})
export class EvmCustomNonceComponent {
  @Input() default: string;
  @Output() changeNonceEvent = new EventEmitter();

  isCustomNonce: boolean;
  customNonce: string;

  constructor(private settingState: SettingState) {
    this.settingState.evmCustomNonceSub.subscribe((res) => {
      this.isCustomNonce = res;
    });
  }

  changeNonce(event) {
    const value = event.target.value;
    event.target.value = value.replace(/[^\d]/g, '');
    this.changeNonceEvent.emit(
      this.customNonce === '' ? this.default : this.customNonce
    );
  }
}
