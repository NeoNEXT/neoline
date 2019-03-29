import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { AccountComponent } from './account.component';

const routes: Routes = [
    { path: 'account', component: AccountComponent }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class AccountRoutingModule {}
