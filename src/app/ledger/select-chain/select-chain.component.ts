import { Component, Output, EventEmitter, Input } from '@angular/core';
import { ChainType, HardwareDevice, STORAGE_NAME } from '@/app/popup/_lib';
import { ChromeService, GlobalService, SettingState } from '@/app/core';

@Component({
  selector: 'app-ledger-chain',
  templateUrl: 'select-chain.component.html',
  styleUrls: ['select-chain.component.scss'],
})
export class LedgerChainComponent {
  @Input() device: HardwareDevice;
  @Output() selectChain = new EventEmitter<ChainType>();
  chain: ChainType = 'Neo3';

  constructor(
    private settingState: SettingState,
    private chromeSer: ChromeService,
    private global: GlobalService
  ) {}

  select() {
    if (this.chain === 'NeoX') {
      this.chromeSer.getStorage(STORAGE_NAME.onePassword).subscribe((res) => {
        if (res !== false) {
          this.selectChain.emit(this.chain);
        } else {
          this.global.snackBarTip('switchOnePasswordFirst');
        }
      });
    } else {
      this.selectChain.emit(this.chain);
    }
  }

  deviceIsSupportNeo2() {
    if (this.device === 'Ledger') {
      return true;
    }
    return false;
  }

  public async jumbToWeb() {
    this.settingState.toWeb('hardwareTutorial');
  }
}
