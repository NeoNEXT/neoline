import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { TransferComponent } from './transfer.component';
import { TransferReceiveComponent } from './receive/receive.component';
import { PopupComponent } from '../popup.component';
import { TransferCreateComponent } from './create/create.component';
import { PopupWalletGuard } from '@/app/core';

const routes: Routes = [
    {
        path: 'popup',
        component: PopupComponent,
        children: [
            {
                path: 'transfer',
                component: TransferComponent,
                canActivate: [PopupWalletGuard],
                children: [
                    { path: 'receive', component: TransferReceiveComponent },
                    { path: 'create/:id', component: TransferCreateComponent },
                    { path: 'create/nft/:nftContract', component: TransferCreateComponent },
                    { path: 'create', component: TransferCreateComponent }
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
