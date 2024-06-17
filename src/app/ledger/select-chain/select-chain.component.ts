import {
  Component,
  OnInit,
  Output,
  EventEmitter,
  OnDestroy,
} from '@angular/core';
import { ChainType, STORAGE_NAME } from '@/app/popup/_lib';
import { ChromeService, GlobalService, SettingState } from '@/app/core';
import { Unsubscribable } from 'rxjs';

@Component({
  selector: 'app-ledger-chain',
  templateUrl: 'select-chain.component.html',
  styleUrls: ['select-chain.component.scss'],
})
export class LedgerChainComponent implements OnDestroy {
  @Output() selectChain = new EventEmitter<ChainType>();
  chain: ChainType = 'Neo2';
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

  public async jumbToWeb() {
    this.settingStateSub = this.settingState.langSub.subscribe((lang) => {
      if (lang !== 'en') {
        lang = '';
        window.open(`https://tutorial.neoline.io/ledgerhardwarewallet`);
      } else {
        window.open(`https://tutorial.neoline.io/v/1/ledger-hardware-wallet`);
      }
    });
  }
}
