import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TransferRoutingModule } from './transfer.route';
import { TransferComponent } from './transfer.component';
import { TransferReceiveComponent } from './receive/receive.component';
import { ShareModule } from '@/app/share';
import { TransferService } from './transfer.service';
import { TransferCreateComponent } from './create/create.component';

@NgModule({
    declarations: [
        TransferComponent,
        TransferReceiveComponent,
        TransferCreateComponent
    ],
    imports: [CommonModule, TransferRoutingModule, ShareModule],
    exports: [],
    providers: [TransferService],
    entryComponents: []
})
export class TransferModule { }
