import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { PopupComponent } from '@popup/popup.component';
import { PopupAddAssetComponent } from '@/app/popup/add/add-asset/add-asset.component';

import { PopupWalletGuard } from '@app/core';
import { PopupMyAssetsComponent } from './my-assets/my-assets.component';

const routes: Routes = [
  {
    path: 'popup',
    component: PopupComponent,
    canActivate: [PopupWalletGuard],
    children: [
      {
        path: 'add-asset',
        component: PopupAddAssetComponent,
      },
      {
        path: 'my-assets',
        component: PopupMyAssetsComponent,
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PopupAddAssetRoutingModule {}
