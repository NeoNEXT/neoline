import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { PopupComponent } from '@popup/popup.component';
import { PopupLoginComponent } from '@popup/login/login.component';
import { PopupLoginGuard } from '@/app/core/guards/wallet.guard';

const routes: Routes = [
    {
        path: 'popup',
        component: PopupComponent,
        children: [
            {
                canActivate: [PopupLoginGuard],
                path: 'login',
                component: PopupLoginComponent
            },
        ]
    }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class PopupLoginRoutingModule { }
