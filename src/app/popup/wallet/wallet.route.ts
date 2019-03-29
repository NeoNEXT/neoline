import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { PopupComponent } from '@popup/popup.component';
import { PopupWalletComponent } from '@popup/wallet/wallet.component';
import { PopupWalletImportComponent } from '@popup/wallet/import/import.component';
import { PopupWalletCreateComponent } from '@popup/wallet/create/create.component';

import { OpenedWalletGuard } from '@app/core';

const routes: Routes = [
    {
        path: 'popup',
        component: PopupComponent,
        children: [
            {
                path: 'wallet',
                component: PopupWalletComponent,
                // canActivate: [ OpenedWalletGuard ],
                children: [
                    { path: '', component: PopupWalletCreateComponent },
                    { path: 'create', component: PopupWalletCreateComponent },
                    { path: 'import', component: PopupWalletImportComponent }
                ]
            },
        ]
    }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class PopupWalletRoutingModule { }
