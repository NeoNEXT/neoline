import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { PopupComponent } from '@popup/popup.component';
import { PopupAuthorizationListComponent } from './authorization-list.component';
import { PopupWalletGuard } from '@/app/core/guards/wallet.guard';

const routes: Routes = [
    {
        path: 'popup',
        component: PopupComponent,
        canActivate: [ PopupWalletGuard ],
        children: [
            {
                path: 'authorization-list',
                component: PopupAuthorizationListComponent
            },
        ]
    }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class PopupAuthorizationListRoutingModule { }
