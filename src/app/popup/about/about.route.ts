import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { PopupComponent } from '@popup/popup.component';
import { PopupAboutComponent } from '@popup/about/about.component';

import { PopupWalletGuard } from '@app/core';

const routes: Routes = [
    {
        path: 'popup',
        component: PopupComponent,
        canActivate: [ PopupWalletGuard ],
        children: [
            {
                path: 'about',
                component: PopupAboutComponent
            },
        ]
    }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class PopupAboutRoutingModule { }
