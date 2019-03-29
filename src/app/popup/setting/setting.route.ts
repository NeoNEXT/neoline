import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { PopupComponent } from '@popup/popup.component';
import { PopupSettingComponent } from '@popup/setting/setting.component';

import { PopupWalletGuard } from '@app/core';

const routes: Routes = [
    {
        path: 'popup',
        component: PopupComponent,
        canActivate: [ PopupWalletGuard ],
        children: [
            {
                path: 'setting',
                component: PopupSettingComponent
            },
        ],
        runGuardsAndResolvers: 'always'
    }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class PopupSettingRoutingModule { }
