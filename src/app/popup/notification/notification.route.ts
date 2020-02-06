import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { PopupComponent } from '@popup/popup.component';

import { PopupNotificationComponent } from './notification.component';
import { PopupNoticeTransferComponent } from './transfer/transfer.component';
import { PopupNoticeSignComponent } from './signature/signature.component';
import { PopupNoticeTokenComponent } from './token/token.component';
import { PopupNoticeAuthComponent } from './authorization/authorization.component';
import { PopupWalletGuard } from '@/app/core';
import { PopupNoticeInvokeComponent } from './invoke/invoke.component';
import { PopupNoticeDeployComponent } from './deploy/deploy.component';
import { PopupNoticeInvokeMultiComponent } from './invoke-multi/invoke-multi.component';

const routes: Routes = [
    {
        path: 'popup',
        component: PopupComponent,
        children: [
            {
                path: 'notification',
                component: PopupNotificationComponent,
                canActivate: [ PopupWalletGuard ],
                children: [
                    { path: '', component: PopupNoticeTransferComponent },
                    { path: 'transfer', component: PopupNoticeTransferComponent},
                    { path: 'signature', component: PopupNoticeSignComponent},
                    { path: 'token', component: PopupNoticeTokenComponent},
                    { path: 'authorization', component: PopupNoticeAuthComponent},
                    { path: 'invoke', component: PopupNoticeInvokeComponent},
                    { path: 'invoke-multi', component: PopupNoticeInvokeMultiComponent},
                    { path: 'deploy', component: PopupNoticeDeployComponent},

                ]
            },
        ]
    }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class PopupNotificationRoutingModule { }
