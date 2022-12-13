import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { TransferReceiveComponent } from './receive/receive.component';
import { PopupComponent } from '../popup.component';
import { TransferCreateComponent } from './create/create.component';
import { PopupWalletGuard } from '@/app/core';

const routes: Routes = [
  {
    path: 'popup',
    component: PopupComponent,
    children: [
      {
        path: 'transfer/receive',
        component: TransferReceiveComponent,
        canActivate: [PopupWalletGuard],
      },
      {
        path: 'transfer/create',
        component: TransferCreateComponent,
        canActivate: [PopupWalletGuard],
      },
      {
        path: 'transfer/create/:id',
        component: TransferCreateComponent,
        canActivate: [PopupWalletGuard],
      },
      {
        path: 'transfer/create/nft/:nftContract',
        component: TransferCreateComponent,
        canActivate: [PopupWalletGuard],
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TransferRoutingModule {}
