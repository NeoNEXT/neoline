import { Component, Output, EventEmitter, Input, OnInit } from '@angular/core';
import { ChainType, HardwareDevice, STORAGE_NAME } from '@/app/popup/_lib';
import { ChromeService, GlobalService, SettingState } from '@/app/core';

@Component({
  selector: 'app-ledger-chain',
  templateUrl: 'select-chain.component.html',
  styleUrls: ['select-chain.component.scss'],
})
export class LedgerChainComponent implements OnInit {
  @Input() device: HardwareDevice;
  @Input() chainType: ChainType;
  @Output() selectChain = new EventEmitter<ChainType>();

  constructor(
    private settingState: SettingState,
    private chromeSer: ChromeService,
    private global: GlobalService
  ) {}

  ngOnInit(): void {
    if (this.chainType === 'Neo2' && !this.deviceIsSupportNeo2()) {
      this.chainType = 'Neo3';
    }
  }

  select() {
    if (this.chainType === 'NeoX') {
      this.chromeSer.getStorage(STORAGE_NAME.onePassword).subscribe((res) => {
        if (res !== false) {
          this.selectChain.emit(this.chainType);
        } else {
          this.global.snackBarTip('switchOnePasswordFirst');
        }
      });
    } else {
      this.selectChain.emit(this.chainType);
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
