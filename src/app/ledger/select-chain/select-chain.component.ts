import {
  Component,
  Output,
  EventEmitter,
  OnDestroy,
  Input,
} from '@angular/core';
import { ChainType, HardwareDevice, STORAGE_NAME } from '@/app/popup/_lib';
import { ChromeService, GlobalService, SettingState } from '@/app/core';
import { Unsubscribable } from 'rxjs';

@Component({
  selector: 'app-ledger-chain',
  templateUrl: 'select-chain.component.html',
  styleUrls: ['select-chain.component.scss'],
})
export class LedgerChainComponent implements OnDestroy {
  @Input() device: HardwareDevice;
  @Output() selectChain = new EventEmitter<ChainType>();
  chain: ChainType = 'Neo3';
  settingStateSub: Unsubscribable;

  constructor(
    private settingState: SettingState,
    private chromeSer: ChromeService,
    private global: GlobalService
  ) {}
  ngOnDestroy(): void {
    this.settingStateSub?.unsubscribe();
  }

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
    this.settingStateSub = this.settingState.langSub.subscribe((lang) => {
      if (lang !== 'en') {
        window.open(`https://tutorial.neoline.io/cn/ying-jian-qian-bao/ledgerhardwarewallet`);
      } else {
        window.open(`https://tutorial.neoline.io/hardware-wallet/ledger-hardware-wallet`);
      }
    });
  }
}
