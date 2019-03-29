import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { PopupComponent } from '@popup/popup.component';
import { PopupAccountComponent } from '@popup/account/account.component';

import { PopupWalletGuard } from '@app/core';

const routes: Routes = [
    {
        path: 'popup',
        component: PopupComponent,
        canActivate: [ PopupWalletGuard ],
        children: [
            {
                path: 'account',
                component: PopupAccountComponent
            },
        ]
    }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class PopupAccountRoutingModule { }
