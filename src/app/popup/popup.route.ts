import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { PopupComponent } from '@popup/popup.component';
import { PopupAboutComponent } from './about/about.component';
import { PopupAccountComponent } from './account/account.component';
import { PopupAssetDetailComponent } from './detail/asset-detail/asset-detail.component';
import { PopupNftDetailComponent } from './detail/nft-detail/nft-detail.component';
import { PopupBackupComponent } from './backup/backup.component';
import { PopupBackupKeyComponent } from './backup/backup-key/backup-key.component';
import { PopupHomeComponent } from './home';
import { PopupLoginComponent } from './login/login.component';
import { PopupNewWalletGuideComponent } from './new-wallet-guide/new-wallet-guide.component';
import { PopupSettingComponent } from './setting/setting.component';
import { PopupOnePasswordComponent } from './one-password/one-password.component';
import { PopupAddressBookComponent } from './address-book/address-book.component';
import { PopupBridgeComponent } from './bridge/bridge.component';

import {
  PopupLoginGuard,
  OpenedWalletGuard,
  PopupWalletGuard,
} from '@app/core';

const routes: Routes = [
  {
    path: 'popup',
    component: PopupComponent,
    children: [
      { path: '', redirectTo: `/popup/home`, pathMatch: 'full' },
      {
        path: 'about',
        canActivate: [PopupWalletGuard],
        component: PopupAboutComponent,
      },
      {
        path: 'account',
        canActivate: [PopupWalletGuard],
        component: PopupAccountComponent,
      },
      {
        path: 'asset',
        canActivate: [PopupWalletGuard],
        component: PopupAssetDetailComponent,
      },
      {
        path: 'nfts/:contract',
        canActivate: [PopupWalletGuard],
        component: PopupNftDetailComponent,
      },
      {
        path: 'backup',
        canActivate: [PopupWalletGuard],
        component: PopupBackupComponent,
      },
      {
        path: 'backup/key',
        canActivate: [PopupWalletGuard],
        component: PopupBackupKeyComponent,
      },
      {
        path: 'home',
        canActivate: [PopupWalletGuard],
        component: PopupHomeComponent,
      },
      {
        canActivate: [PopupLoginGuard],
        path: 'login',
        component: PopupLoginComponent,
      },
      {
        canActivate: [OpenedWalletGuard],
        path: 'wallet/new-guide',
        component: PopupNewWalletGuideComponent,
      },
      {
        path: 'setting',
        canActivate: [PopupWalletGuard],
        component: PopupSettingComponent,
      },
      {
        path: 'one-password',
        canActivate: [PopupWalletGuard],
        component: PopupOnePasswordComponent,
      },
      {
        path: 'address-book',
        canActivate: [PopupWalletGuard],
        component: PopupAddressBookComponent,
      },
      {
        path: 'bridge',
        canActivate: [PopupWalletGuard],
        component: PopupBridgeComponent,
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PopupRoutingModule {}
