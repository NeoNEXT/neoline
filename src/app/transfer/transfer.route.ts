import { Routes, RouterModule } from '@angular/router';
import { NgModule } from '@angular/core';

import { TransferComponent } from './transfer.component';
import { TransferCreateomponent } from './create/create.component';
import { TransferResultComponent } from './result/result.component';
import { TransferReceiveComponent } from './receive/receive.component';
import { TransferExportComponent } from './export/export.component';

const routes: Routes = [
    {
        path: 'transfer',
        component: TransferComponent,
        outlet: 'transfer',
        children: [
            { path: 'create/:id', component: TransferCreateomponent },
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
