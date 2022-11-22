import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { PopupComponent } from '@popup/popup.component';
import { PopupWalletComponent } from '@popup/wallet/wallet.component';

import { OpenedWalletGuard } from '@app/core';

const routes: Routes = [
  {
    path: 'popup',
    component: PopupComponent,
    children: [
      {
        path: 'wallet',
        component: PopupWalletComponent,
        canActivate: [OpenedWalletGuard],
      },
      {
        path: 'wallet/import',
        component: PopupWalletComponent,
        canActivate: [OpenedWalletGuard],
      },
      {
        path: 'wallet/create',
        component: PopupWalletComponent,
        canActivate: [OpenedWalletGuard],
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PopupWalletRoutingModule {}
