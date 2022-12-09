import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { PopupComponent } from '@popup/popup.component';
import { PopupAddNftComponent } from './add-nft.component';
import { PopupMyNftsComponent } from './my-nfts/my-nfts.component';

import { PopupWalletGuard } from '@app/core';

const routes: Routes = [
  {
    path: 'popup',
    component: PopupComponent,
    canActivate: [PopupWalletGuard],
    children: [
      {
        path: 'add-nft',
        component: PopupAddNftComponent,
      },
      {
        path: 'my-nfts',
        component: PopupMyNftsComponent,
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PopupAddNftRoutingModule {}
