import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { TransferReceiveComponent } from './receive/receive.component';
import { TransferCreateComponent } from './create/create.component';
import { PopupNeo2WalletGuard, PopupWalletGuard } from '@/app/core';

/**
 * Mounted lazily at `popup/transfer` by PopupRoutingModule, so these paths are
 * relative to that prefix and the PopupComponent shell comes from the parent
 * route. The resulting URLs are unchanged (`popup/transfer/receive`, ...).
 */
const routes: Routes = [
  {
    path: 'receive',
    component: TransferReceiveComponent,
    canActivate: [PopupWalletGuard, PopupNeo2WalletGuard],
  },
  {
    path: 'create',
    component: TransferCreateComponent,
    canActivate: [PopupWalletGuard, PopupNeo2WalletGuard],
  },
  {
    path: 'create/:id',
    component: TransferCreateComponent,
    canActivate: [PopupWalletGuard, PopupNeo2WalletGuard],
  },
  {
    path: 'create/nft/:nftContract',
    component: TransferCreateComponent,
    canActivate: [PopupWalletGuard, PopupNeo2WalletGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TransferRoutingModule {}
