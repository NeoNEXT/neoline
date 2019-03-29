import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { PopupComponent } from '@popup/popup.component';
import { PopupHomeComponent } from '@popup/home/home.component';
import { PopupHomeDetailComponent } from '@popup/home/detail/detail.component';

import { PopupWalletGuard } from '@app/core';

import { NEO } from '@models/models';

const routes: Routes = [
    {
        path: 'popup',
        component: PopupComponent,
        canActivate: [ PopupWalletGuard ],
        children: [
            {
                path: 'home',
                component: PopupHomeComponent,
                children: [
                    { path: '', redirectTo: `/popup/home/${ NEO }`, pathMatch: 'full' },
                    { path: ':id', component: PopupHomeDetailComponent },
                ]
            }
        ]
    }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class PopupHomeRoutingModule { }
