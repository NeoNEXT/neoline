import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TransferRoutingModule } from './transfer.route';
import { TransferComponent } from './transfer.component';
import { TransferCreateComponent } from './create/create.component';
import { TransferResultComponent } from './result/result.component';
import { ShareModule } from '../share';
import { TransferService } from './transfer.service';
import { PwdDialog } from './+pwd/pwd.dialog';
import { TransferReceiveComponent } from './receive/receive.component';
import { TransferExportComponent } from './export/export.component';

@NgModule({
    declarations: [
        TransferComponent, TransferCreateComponent, TransferResultComponent,
        TransferReceiveComponent, TransferExportComponent,
        PwdDialog
    ],
    imports: [CommonModule, TransferRoutingModule, ShareModule],
    exports: [],
    providers: [TransferService],
    entryComponents: [PwdDialog]
})
export class TransferModule { }
