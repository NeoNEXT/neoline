import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { PopupWalletComponent } from '@popup/wallet/wallet.component';

import { OpenedWalletGuard } from '@app/core';

/**
 * Mounted lazily at `popup/wallet` by PopupRoutingModule, so these paths are
 * relative to that prefix. URLs are unchanged (`popup/wallet`,
 * `popup/wallet/import`, `popup/wallet/create`).
 *
 * Note `popup/wallet/new-guide` is deliberately NOT here — it stays eager in
 * PopupRoutingModule, declared ahead of this mount.
 */
const routes: Routes = [
  {
    path: '',
    component: PopupWalletComponent,
    canActivate: [OpenedWalletGuard],
  },
  {
    path: 'import',
    component: PopupWalletComponent,
    canActivate: [OpenedWalletGuard],
  },
  {
    path: 'create',
    component: PopupWalletComponent,
    canActivate: [OpenedWalletGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PopupWalletRoutingModule {}
