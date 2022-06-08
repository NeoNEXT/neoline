import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { WalletGuard } from '@app/core';
import { LedgerComponent } from './ledger.component';

const routes: Routes = [
    {
        path: 'ledger',
        component: LedgerComponent,
        canActivate: [WalletGuard],
    },
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule],
})
export class LedgerRoutingModule {}
