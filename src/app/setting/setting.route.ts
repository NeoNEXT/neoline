import {
    Routes,
    RouterModule
} from '@angular/router';
import {
    NgModule
} from '@angular/core';

import {
    SettingComponent
} from './setting.component';
import {
    SettingAboutComponent
} from './about/about.component';
import {
    SettingDetailComponent
} from './setting-detail/setting-detail.component';
import {
    SettingWalletComponent
} from './wallet/wallet.component';
import { WalletGuard } from '@app/core';

const routes: Routes = [{
    path: 'setting',
    component: SettingComponent,
    canActivate: [WalletGuard],
    children: [
        {
            path: '',
            redirectTo: '/setting/detail',
            pathMatch: 'full'
        },
        {
            path: 'about',
            component: SettingAboutComponent
        },
        {
            path: 'detail',
            component: SettingDetailComponent
        },
        {
            path: 'wallet',
            component: SettingWalletComponent
        },

    ]
}];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class SettingRoutingModule {}
