import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { PopupComponent } from '@popup/popup.component';
import { PopupAboutComponent } from './about/about.component';
import { PopupAccountComponent } from './account/account.component';
import { PopupAssetDetailComponent } from './asset-detail/asset-detail.component';
import { PopupBackupComponent } from './backup/backup.component';
import { PopupHomeComponent } from './home';
import { PopupLoginComponent } from './login/login.component';
import { PopupNewWalletGuideComponent } from './new-wallet-guide/new-wallet-guide.component';
import { PopupSettingComponent } from './setting/setting.component';

import {
    PopupLoginGuard,
    OpenedWalletGuard,
    PopupWalletGuard,
} from '@app/core';

const routes: Routes = [
    {
        path: 'popup',
        component: PopupComponent,
        canActivate: [PopupWalletGuard],
        children: [
            { path: '', redirectTo: `/popup/home`, pathMatch: 'full' },
            { path: 'about', component: PopupAboutComponent },
            { path: 'account', component: PopupAccountComponent },
            { path: 'asset/:assetId', component: PopupAssetDetailComponent },
            { path: 'backup', component: PopupBackupComponent },
            { path: 'home', component: PopupHomeComponent },
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
            { path: 'setting', component: PopupSettingComponent },
        ],
    },
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule],
})
export class PopupRoutingModule {}
