import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { TransferComponent } from './transfer.component';
import { TransferReceiveComponent } from './receive/receive.component';
import { WalletGuard, PopupWalletGuard } from '@app/core';
import { PopupComponent } from '../popup.component';

const routes: Routes = [
    {
        path: 'popup',
        component: PopupComponent,
        children: [
            {
                path: 'transfer',
                component: TransferComponent,
                children: [
                    { path: 'receive', component: TransferReceiveComponent }
                ]
            }
        ]
    }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class TransferRoutingModule { }
