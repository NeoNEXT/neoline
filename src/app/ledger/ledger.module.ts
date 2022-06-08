import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LedgerRoutingModule } from './ledger.route';
import { ShareModule } from '../share';
import { LedgerComponent } from './ledger.component';
import { LedgerChainComponent } from './select-chain/select-chain.component';
import { AddressSelectorComponent } from './address-selector/address-selector.component';
import { ImportSuccessComponent } from './import-success/import-success.component';
import { AccountNameComponent } from './account-name/account-name.component';

@NgModule({
    declarations: [
        LedgerComponent,
        LedgerChainComponent,
        AddressSelectorComponent,
        ImportSuccessComponent,
        AccountNameComponent,
    ],
    imports: [CommonModule, LedgerRoutingModule, ShareModule],
    exports: [],
    providers: [],
    entryComponents: [],
})
export class LedgerModule {}
