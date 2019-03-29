import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { WalletComponent } from './wallet.component';
import { WalletImportComponent } from './import/import.component';
import { WalletCreateComponent } from './create/create.component';
import { OpenedWalletGuard } from '@app/core';

const routes: Routes = [
    {
        path: 'wallet',
        component: WalletComponent,
        children: [
            { path: '', redirectTo: 'create', pathMatch: 'full' },
            { path: 'create', component: WalletCreateComponent },
            { path: 'import', component: WalletImportComponent }
        ],
    }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class WalletRoutingModule { }
