import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { TransferComponent } from './transfer.component';
import { TransferResultComponent } from './result/result.component';
import { TransferExportComponent } from './export/export.component';
import { WalletGuard } from '@app/core';

const routes: Routes = [
    {
        path: 'transfer',
        component: TransferComponent,
        outlet: 'transfer',
        // canActivate: [WalletGuard],
        children: [
            { path: 'result', component: TransferResultComponent },
            { path: 'export', component: TransferExportComponent }
        ]
    }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class TransferRoutingModule { }
