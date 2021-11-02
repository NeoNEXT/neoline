import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { AccountComponent } from './account.component';
import { WalletGuard } from '@app/core';

const routes: Routes = [
    { path: 'account', component: AccountComponent, canActivate: [WalletGuard] }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class AccountRoutingModule {}
