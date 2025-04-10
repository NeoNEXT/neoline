import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LedgerRoutingModule } from './ledger.route';
import { ShareModule } from '../share';
import { LedgerComponent } from './ledger.component';
import { LedgerChainComponent } from './select-chain/select-chain.component';
import { AddressSelectorComponent } from './address-selector/address-selector.component';
import { AccountNameComponent } from './account-name/account-name.component';

@NgModule({
  declarations: [
    LedgerComponent,
    LedgerChainComponent,
    AddressSelectorComponent,
    AccountNameComponent,
  ],
  imports: [CommonModule, LedgerRoutingModule, ShareModule],
  exports: [],
  providers: [],
})
export class LedgerModule {}
