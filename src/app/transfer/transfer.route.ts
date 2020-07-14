import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { TransferComponent } from './transfer.component';
import { TransferCreateComponent } from './create/create.component';
import { TransferResultComponent } from './result/result.component';
import { TransferReceiveComponent } from './receive/receive.component';
import { TransferExportComponent } from './export/export.component';
import { WalletGuard } from '@app/core';

const routes: Routes = [
    {
        path: 'transfer',
        component: TransferComponent,
        outlet: 'transfer',
        // canActivate: [WalletGuard],
        children: [
            { path: 'create/:id', component: TransferCreateComponent },
            { path: 'result', component: TransferResultComponent },
            { path: 'receive', component: TransferReceiveComponent },
            { path: 'export', component: TransferExportComponent }
        ]
    }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class TransferRoutingModule { }
