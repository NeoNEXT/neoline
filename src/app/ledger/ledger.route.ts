import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { PopupWalletGuard } from '@app/core';
import { LedgerComponent } from './ledger.component';
import { HardwareConnectComponent } from './hardware-connect/hardware-connect.component';

// Mounted lazily at `ledger` by AppRoutingModule.
const routes: Routes = [
  {
    path: 'hardware-connect',
    component: HardwareConnectComponent,
  },
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
