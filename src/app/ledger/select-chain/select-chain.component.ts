import {
  Component,
  OnInit,
  Output,
  EventEmitter,
  OnDestroy,
} from '@angular/core';
import { ChainType } from '@/app/popup/_lib';
import { SettingState } from '@/app/core';
import { Unsubscribable } from 'rxjs';

@Component({
  selector: 'app-ledger-chain',
  templateUrl: 'select-chain.component.html',
  styleUrls: ['select-chain.component.scss'],
})
export class LedgerChainComponent implements OnInit, OnDestroy {
  @Output() selectChain = new EventEmitter<ChainType>();
  chain: ChainType = 'Neo2';
  settingStateSub: Unsubscribable;

  constructor(private settingState: SettingState) {}
  ngOnDestroy(): void {
    this.settingStateSub?.unsubscribe();
  }

  ngOnInit(): void {}

  select() {
    this.selectChain.emit(this.chain);
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
