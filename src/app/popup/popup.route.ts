import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { PopupComponent } from '@popup/popup.component';
import { NEO } from '@models/models';

const routes: Routes = [
    {
        path: 'popup',
        component: PopupComponent,
        children: [
            { path: '', redirectTo: `/popup/home/${ NEO }`, pathMatch: 'full' },
        ]
    }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class PopupRoutingModule { }
