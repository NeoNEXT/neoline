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
import { PopupAccountListComponent } from './account-list/account-list.component';
import { PopupNetworkListComponent } from './network-list/network-list.component';
import { PopupNoticeComponent } from './notice/notice.component';

import {
  PopupLoginGuard,
  OpenedWalletGuard,
  PopupWalletGuard,
} from '@app/core';

/**
 * This is the single owner of the `popup` path. Feature modules used to each
 * declare their own top-level `{ path: 'popup', component: PopupComponent }`
 * entry and rely on the router falling through to the next sibling when no
 * child matched. That only works while every one of those modules is eagerly
 * loaded — the router cannot look inside a lazy module to decide whether to
 * fall through — so the lazily loaded features are mounted here as children
 * with a distinct path prefix instead.
 *
 * All URLs are unchanged. They have to be: the background worker builds
 * `index.html#popup/notification/...` and `index.html#popup/login?...` as
 * strings (extension/background/tool.ts, request-handlers/connect-session.ts).
 */
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
        path: 'account-list',
        canActivate: [PopupWalletGuard],
        component: PopupAccountListComponent,
      },
      {
        path: 'network-list',
        canActivate: [PopupWalletGuard],
        component: PopupNetworkListComponent,
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
        path: 'perps',
        canActivate: [PopupWalletGuard],
        loadChildren: () =>
          import('./perps/perps.module').then((m) => m.PerpsModule),
      },
      {
        canActivate: [PopupLoginGuard],
        path: 'login',
        component: PopupLoginComponent,
      },
      // Must stay ahead of the lazy `wallet` mount below, which would
      // otherwise swallow `wallet/new-guide`.
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
      {
        path: 'notice',
        canActivate: [PopupWalletGuard],
        component: PopupNoticeComponent,
      },
      //#region lazily loaded features
      {
        path: 'notification',
        loadChildren: () =>
          import('./notification/notification.module').then(
            (m) => m.PopupNotificationModule
          ),
      },
      {
        path: 'transfer',
        loadChildren: () =>
          import('./transfer/transfer.module').then((m) => m.TransferModule),
      },
      {
        path: 'wallet',
        loadChildren: () =>
          import('./wallet/wallet.module').then((m) => m.PopupWalletModule),
      },
      //#endregion
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PopupRoutingModule {}
