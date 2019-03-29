import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { PopupComponent } from '@popup/popup.component';
import { PopupLoginComponent } from '@popup/login/login.component';

const routes: Routes = [
    {
        path: 'popup',
        component: PopupComponent,
        children: [
            {
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
