import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { WalletComponent } from './wallet.component';
import { WalletImportComponent } from './import/import.component';
import { WalletCreateComponent } from './create/create.component';
import { WalletGuard } from '@app/core';

const routes: Routes = [
    {
        path: 'wallet',
        component: WalletComponent,
        // canActivate: [ WalletGuard ],
        children: [
            { path: '', redirectTo: 'create', pathMatch: 'full' },
            { path: 'import', redirectTo: 'import/PrivateKey', pathMatch: 'full' },
            { path: 'create', component: WalletCreateComponent },
            { path: 'import/:type', component: WalletImportComponent }
        ],
    }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class WalletRoutingModule { }
