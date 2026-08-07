import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { PopupWalletGuard } from '@app/core';
import { LedgerComponent } from './ledger.component';

/**
 * Mounted lazily at `ledger` by AppRoutingModule, so the path is empty here.
 * The URL is unchanged.
 */
const routes: Routes = [
  {
    path: '',
    component: LedgerComponent,
    canActivate: [PopupWalletGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class LedgerRoutingModule {}
