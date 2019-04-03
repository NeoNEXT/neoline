
import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { PopupComponent } from '@popup/popup.component';
import { PopupNewWalletGuideComponent } from '@popup/new-wallet-guide/new-wallet-guide.component';

const routes: Routes = [
    {
        path: 'popup',
        component: PopupComponent,
        children: [
            {
                path: 'wallet/new',
                component: PopupNewWalletGuideComponent
            },
        ]
    }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class PopupNewWalletGuideRoutingModule { }
